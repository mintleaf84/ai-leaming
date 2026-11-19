import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_app/core/network/server_config.dart';

/// 内存版存储：单测不碰平台通道。字段直接赋值，不走构造参数。
class _FakeServerBaseUrlStore implements ServerBaseUrlStore {
  String? value;
  bool failOnWrite = false;
  int writeCount = 0;

  @override
  Future<String?> read() async => value;

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

void main() {
  late _FakeServerBaseUrlStore store;

  setUp(() {
    store = _FakeServerBaseUrlStore();
  });

  ProviderContainer makeContainer({String? initialBaseUrl}) {
    final container = ProviderContainer(
      overrides: [
        serverBaseUrlStoreProvider.overrideWithValue(store),
        initialServerBaseUrlProvider.overrideWithValue(initialBaseUrl),
      ],
    );
    addTearDown(container.dispose);
    return container;
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

  group('持久化往返', () {
    test('保存后重新启动（新容器读同一份存储）仍然生效', () async {
      final first = makeContainer();
      await first
          .read(serverConfigProvider.notifier)
          .save('https://api.example.com/api');

      final second = makeContainer(initialBaseUrl: store.value);

      expect(
        second.read(serverConfigProvider).effectiveBaseUrl,
        'https://api.example.com/api',
      );
    });
  });
}
