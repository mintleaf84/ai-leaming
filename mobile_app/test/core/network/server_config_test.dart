import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/network/server_config.dart';
import 'package:mocktail/mocktail.dart';

/// 内存版存储：单测不碰平台通道。字段直接赋值，不走构造参数。
class _FakeServerBaseUrlStore implements ServerBaseUrlStore {
  String? value;
  bool failOnWrite = false;
  bool failOnRead = false;
  int writeCount = 0;

  @override
  Future<String?> read() async {
    if (failOnRead) {
      throw StateError('keystore unavailable');
    }
    return value;
  }

  @override
  Future<void> write(String baseUrl) async {
    if (failOnWrite) {
      throw StateError('keystore unavailable');
    }
    value = baseUrl;
    writeCount++;
  }

  @override
  Future<void> clear() async {
    value = null;
  }
}

class _MockSecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  late _FakeServerBaseUrlStore store;

  setUp(() {
    store = _FakeServerBaseUrlStore();
  });

  ProviderContainer makeContainer({
    String? initialBaseUrl,
    FlutterSecureStorage? jwtStorage,
  }) {
    final container = ProviderContainer(
      overrides: [
        serverBaseUrlStoreProvider.overrideWithValue(store),
        initialServerBaseUrlProvider.overrideWithValue(initialBaseUrl),
        if (jwtStorage != null)
          authJwtStorageProvider.overrideWithValue(jwtStorage),
      ],
    );
    addTearDown(container.dispose);
    return container;
  }

  /// 模拟 main()：runApp 之前经 store 读一次，作为 initialServerBaseUrlProvider。
  Future<ProviderContainer> makeContainerFromStore() async {
    final seed = await readInitialServerBaseUrl(store);
    return makeContainer(initialBaseUrl: seed);
  }


  group('ServerConfigNotifier 启动状态（读）', () {
    test('已保存地址时直接生效', () {
      final container = makeContainer(
        initialBaseUrl: 'http://10.0.2.2:3000/api',
      );

      final state = container.read(serverConfigProvider);

      expect(state.storedBaseUrl, 'http://10.0.2.2:3000/api');
      expect(state.effectiveBaseUrl, 'http://10.0.2.2:3000/api');
      expect(state.isConfigured, true);
    });

    test('没有运行时地址、编译期也未注入时处于未配置状态', () {
      final container = makeContainer();

      final state = container.read(serverConfigProvider);

      expect(state.effectiveBaseUrl, isNull);
      expect(state.isConfigured, false);
    });

    test('已保存但格式非法的地址不会被采用', () {
      final container = makeContainer(initialBaseUrl: 'localhost:3000/api');

      expect(container.read(serverConfigProvider).isConfigured, false);
    });
  });

  group('ServerConfigNotifier 保存（写）', () {
    test('保存合法地址：落盘、立即生效、错误清空', () async {
      final container = makeContainer();
      final notifier = container.read(serverConfigProvider.notifier);

      final failure = await notifier.save('  http://192.168.1.10:3000/api/  ');

      expect(failure, isNull);
      expect(store.value, 'http://192.168.1.10:3000/api');
      final state = container.read(serverConfigProvider);
      expect(state.storedBaseUrl, 'http://192.168.1.10:3000/api');
      expect(state.effectiveBaseUrl, 'http://192.168.1.10:3000/api');
      expect(state.isConfigured, true);
      expect(state.errorMessage, isNull);
      expect(state.isSaving, false);
    });

    test('保存非法地址：返回错误文案且不落盘', () async {
      final container = makeContainer(
        initialBaseUrl: 'http://10.0.2.2:3000/api',
      );
      final notifier = container.read(serverConfigProvider.notifier);

      final failure = await notifier.save('192.168.1.10:3000/api');

      expect(failure, isNotNull);
      expect(store.writeCount, 0);
      final state = container.read(serverConfigProvider);
      expect(state.errorMessage, failure);
      // 一次手滑不该把 App 打到「未配置」：原地址保持不变。
      expect(state.effectiveBaseUrl, 'http://10.0.2.2:3000/api');
    });

    test('写安全存储失败：错误经 provider 状态表达，原地址保留', () async {
      store.failOnWrite = true;
      final container = makeContainer(
        initialBaseUrl: 'http://10.0.2.2:3000/api',
      );
      final notifier = container.read(serverConfigProvider.notifier);

      final failure = await notifier.save('http://192.168.1.10:3000/api');

      expect(failure, isNotNull);
      final state = container.read(serverConfigProvider);
      expect(state.errorMessage, failure);
      expect(state.effectiveBaseUrl, 'http://10.0.2.2:3000/api');
      expect(state.isSaving, false);
    });

    test('重新编辑（clearError）后错误提示消失', () async {
      final container = makeContainer();
      final notifier = container.read(serverConfigProvider.notifier);

      await notifier.save('not-a-url');
      expect(container.read(serverConfigProvider).errorMessage, isNotNull);

      notifier.clearError();

      expect(container.read(serverConfigProvider).errorMessage, isNull);
    });
  });

  group('持久化往返（启动读取路径）', () {
    test('保存后重新启动：经 store.read 得到启动种子并生效', () async {
      final first = makeContainer();
      await first
          .read(serverConfigProvider.notifier)
          .save('https://api.example.com/api');

      // 第二个容器不手工传 store.value：走与 main() 相同的
      // readInitialServerBaseUrl(store) → initialServerBaseUrlProvider 路径。
      final second = await makeContainerFromStore();

      expect(
        second.read(serverConfigProvider).effectiveBaseUrl,
        'https://api.example.com/api',
      );
    });

    test('启动读取失败：种子为 null，进入未配置状态', () async {
      store.failOnRead = true;

      final seed = await readInitialServerBaseUrl(store);
      final container = makeContainer(initialBaseUrl: seed);

      expect(seed, isNull);
      expect(container.read(serverConfigProvider).isConfigured, false);
    });
  });

  group('换服务器时清理旧 JWT', () {
    late _MockSecureStorage jwtStorage;

    setUp(() {
      jwtStorage = _MockSecureStorage();
      when(
        () => jwtStorage.delete(key: any(named: 'key')),
      ).thenAnswer((_) async {});
    });

    test('origin 变化（scheme/host/port 任一不同）：清除 jwt_token', () async {
      final container = makeContainer(
        initialBaseUrl: 'http://10.0.2.2:3000/api',
        jwtStorage: jwtStorage,
      );

      await container
          .read(serverConfigProvider.notifier)
          .save('https://api.example.com/api');

      verify(() => jwtStorage.delete(key: authJwtStorageKey)).called(1);
    });

    test('同 origin 只改路径：不清 jwt_token', () async {
      final container = makeContainer(
        initialBaseUrl: 'http://10.0.2.2:3000/api',
        jwtStorage: jwtStorage,
      );

      await container
          .read(serverConfigProvider.notifier)
          .save('http://10.0.2.2:3000/api/v2');

      verifyNever(() => jwtStorage.delete(key: any(named: 'key')));
    });

    test('首次配置（此前没有生效地址）：不清 jwt_token', () async {
      final container = makeContainer(jwtStorage: jwtStorage);

      await container
          .read(serverConfigProvider.notifier)
          .save('http://10.0.2.2:3000/api');

      verifyNever(() => jwtStorage.delete(key: any(named: 'key')));
    });
  });
}
