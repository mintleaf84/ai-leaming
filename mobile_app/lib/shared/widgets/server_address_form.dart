import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import '../../core/constants/api_constants.dart';
import '../../core/network/server_config.dart';
import '../../core/theme/app_colors.dart';

/// 服务器地址输入表单。
///
/// 设置页弹窗与启动时的「需要配置服务器地址」页共用同一份实现：
/// 格式校验失败、持久化失败都经 [ServerConfigState.errorMessage] 表达，
/// 这里只负责渲染（不弹 toast）；保存成功后原地显示新地址。
class ServerAddressForm extends ConsumerStatefulWidget {
  const ServerAddressForm({this.initialValue, this.onSaved, super.key});

  /// 输入框初始值，通常是当前生效地址。
  final String? initialValue;

  /// 保存成功后的回调（例如关闭弹窗）。
  final ValueChanged<String>? onSaved;

  @override
  ConsumerState<ServerAddressForm> createState() => _ServerAddressFormState();
}

class _ServerAddressFormState extends ConsumerState<ServerAddressForm> {
  late final TextEditingController _controller = TextEditingController(
    text: widget.initialValue ?? '',
  );
  String? _savedValue;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final failure = await ref
        .read(serverConfigProvider.notifier)
        .save(_controller.text);
    if (!mounted) {
      return;
    }
    if (failure != null) {
      // 失败文案已经在 provider 状态里，build 会渲染成输入框下方的红字。
      setState(() {
        _savedValue = null;
      });
      return;
    }
    final saved = ApiConstants.normalizeBaseUrl(_controller.text);
    setState(() {
      _savedValue = saved;
    });
    widget.onSaved?.call(saved);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(serverConfigProvider);
    final theme = Theme.of(context);

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextField(
          controller: _controller,
          keyboardType: TextInputType.url,
          autocorrect: false,
          enabled: !state.isSaving,
          onChanged: (_) => ref.read(serverConfigProvider.notifier).clearError(),
          decoration: InputDecoration(
            hintText: 'http://10.0.2.2:3000/api',
            border: const OutlineInputBorder(),
            errorText: state.errorMessage,
            errorMaxLines: 2,
          ),
        ),
        SizedBox(height: 8.h),
        Text(
          '支持 http:// 与 https://。Android 模拟器访问宿主电脑用 10.0.2.2，真机用电脑的局域网 IP。',
          style: theme.textTheme.bodySmall?.copyWith(
            fontSize: 12.sp,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        if (_savedValue != null) ...[
          SizedBox(height: 8.h),
          Text(
            '已保存并生效：$_savedValue',
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 12.sp,
              color: context.colors.accent,
            ),
          ),
        ],
        SizedBox(height: 16.h),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            onPressed: state.isSaving ? null : _submit,
            child: state.isSaving
                ? SizedBox(
                    width: 18.w,
                    height: 18.w,
                    child: const CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text('保存'),
          ),
        ),
      ],
    );
  }
}
