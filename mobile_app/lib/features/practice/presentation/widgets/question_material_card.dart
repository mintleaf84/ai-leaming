import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:flutter_html_table/flutter_html_table.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';

import 'package:mobile_app/core/theme/app_colors.dart';
import 'package:mobile_app/core/theme/app_icons.dart';

/// 材料题的材料卡：题干上方的「材料」区块。
///
/// 数据来源（见 `practice.ts`）：
/// - [materialHtml]：服务端 DOMPurify 白名单清洗后的 HTML，能表达表格/上下标/图片；
/// - [material]：纯文本兜底，老接口或 HTML 被清空时用。
///
/// 渲染优先级 HTML > 纯文本 > 不占位。**两者都为空时不渲染任何东西**：
/// 离线会话（`LocalPracticeStore` 不缓存材料）也会走到这里，那种情况下
/// 「没有材料」是数据缺失而不是题目本来没材料，所以既不能占位也不能提示。
class QuestionMaterialCard extends StatefulWidget {
  const QuestionMaterialCard({super.key, this.material, this.materialHtml});

  /// 材料纯文本。
  final String? material;

  /// 材料富文本（已清洗的 HTML）。
  final String? materialHtml;

  /// 材料正文基准字号（sp）。
  ///
  /// 系统字号放大由 `MediaQuery.textScaler` 负责——**不要**在这里再乘一个系数，
  /// 否则系统设成 1.3 倍时会变成 1.69 倍。测试里的「1.3 倍字号」指
  /// `pumpScreen(textScale: 1.3)`，不是这个常量。
  static const double baseFontSize = 14;

  /// 相对正文基准的字号倍数。
  static const double fontScale = 1.0;

  /// 折叠阈值：超过这么多行才折叠。
  static const int collapsedLines = 6;

  /// 行高倍数。
  static const double lineHeight = 1.6;

  /// 是否有可渲染的材料。空串与全空白都按「没有」处理——服务端字段可能给 `''`。
  static bool hasMaterial(String? material, String? materialHtml) =>
      (materialHtml?.trim().isNotEmpty ?? false) ||
      (material?.trim().isNotEmpty ?? false);

  @override
  State<QuestionMaterialCard> createState() => _QuestionMaterialCardState();
}

class _QuestionMaterialCardState extends State<QuestionMaterialCard> {
  bool _expanded = true;

  /// 是否已经按「超过 6 行」自动折过一次。
  ///
  /// 只在**首次**判定溢出时收起：用户手动点开之后不再被自动折回去
  /// （否则每次重绘都把用户刚展开的材料合上，等于按钮失灵）。
  bool _autoCollapsed = false;

  /// 内容是否超过 [QuestionMaterialCard.collapsedLines] 行。
  ///
  /// 只能量完再判：HTML 的行数取决于标签嵌套与换行，用字数或 `TextPainter`
  /// 猜都会错（表格、图片高度更是无从算起）。所以先按完整内容布局一次，
  /// 用 [_MeasureSize] 报回真实高度，再决定要不要挂折叠。
  bool _overflows = false;

  @override
  Widget build(BuildContext context) {
    if (!QuestionMaterialCard.hasMaterial(
      widget.material,
      widget.materialHtml,
    )) {
      return const SizedBox.shrink();
    }

    final colors = context.colors;
    final fontSize =
        QuestionMaterialCard.baseFontSize * QuestionMaterialCard.fontScale;
    final textScaler = MediaQuery.textScalerOf(context);
    // 折叠高度按「6 行 × 实际行高」算，跟随系统字号缩放一起变——
    // 否则 1.3 倍字号下 6 行会被裁成 4 行半。
    // 注意 `.sp`（按屏宽缩放）和 textScaler（系统字号）是两级缩放，Text 里两级都会生效，
    // 这里必须按同样的顺序算，否则窄屏上算出来的 6 行比实际短。
    final lineHeight =
        textScaler.scale(fontSize.sp) * QuestionMaterialCard.lineHeight;
    final collapsedHeight =
        lineHeight * QuestionMaterialCard.collapsedLines + 1; // +1 抗浮点误差

    final content = _MeasureSize(
      onChange: (size) {
        final overflows = size.height > collapsedHeight + 0.5;
        if (overflows == _overflows) return;
        setState(() {
          _overflows = overflows;
          // 首次判定「太长」时自动收起：材料题的材料动辄上千字，
          // 默认全展开会把题干和选项挤到屏幕外。
          if (overflows && !_autoCollapsed) {
            _autoCollapsed = true;
            _expanded = false;
          }
        });
      },
      child: _buildBody(fontSize),
    );

    final collapsed = _overflows && !_expanded;

    return Container(
      width: double.infinity,
      margin: EdgeInsets.only(bottom: 20.h),
      padding: EdgeInsets.fromLTRB(14.w, 12.h, 14.w, 12.h),
      decoration: BoxDecoration(
        color: colors.surfaceAlt,
        borderRadius: BorderRadius.circular(10.r),
        border: Border.all(color: colors.border, width: 0.5),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                AppIcons.bookOutlined,
                size: 14.sp,
                color: colors.textSecondary,
              ),
              SizedBox(width: 6.w),
              Text(
                '材料',
                style: TextStyle(
                  fontSize: 12.sp,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1,
                  color: colors.textSecondary,
                ),
              ),
            ],
          ),
          SizedBox(height: 8.h),
          if (collapsed)
            // 折叠态：外层限高 + 裁切，内层用 OverflowBox 让内容仍按完整高度
            // 布局（否则量到的是被截断的高度，展开按钮会来回闪）。
            SizedBox(
              height: collapsedHeight,
              child: ClipRect(
                child: OverflowBox(
                  alignment: Alignment.topLeft,
                  minHeight: 0,
                  maxHeight: double.infinity,
                  child: content,
                ),
              ),
            )
          else
            content,
          if (_overflows) ...[
            SizedBox(height: 4.h),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () => setState(() => _expanded = !_expanded),
                icon: Icon(
                  _expanded ? AppIcons.expandLess : AppIcons.expandMore,
                  size: 16.sp,
                  color: colors.accent,
                ),
                label: Text(
                  _expanded ? '收起' : '展开',
                  style: TextStyle(fontSize: 12.sp, color: colors.accent),
                ),
                style: TextButton.styleFrom(
                  padding: EdgeInsets.symmetric(horizontal: 8.w),
                  minimumSize: Size(0, 32.h),
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  /// HTML 优先，其次纯文本。
  Widget _buildBody(double fontSize) {
    final html = widget.materialHtml;
    if (html != null && html.trim().isNotEmpty) {
      return Html(
        data: html,
        // 表格是独立扩展包（flutter_html 3.x 拆出去的），不装会把 <table> 退化成纯文本
        extensions: const [TableHtmlExtension()],
        // 服务端已清洗（DOMPurify 白名单含 img/table/sub/sup），这里不再二次过滤。
        // 表格靠 flutter_html_table 扩展渲染；iframe 不在白名单里，不会出现。
        style: {
          'body': Style(
            margin: Margins.zero,
            padding: HtmlPaddings.zero,
            fontSize: FontSize(fontSize),
            lineHeight: LineHeight.number(QuestionMaterialCard.lineHeight),
            color: context.colors.text.withValues(alpha: 0.9),
            fontFamily: 'Noto Serif SC',
          ),
          'p': Style(margin: Margins.only(bottom: 8)),
          'img': Style(width: Width(100, Unit.percent)),
        },
      );
    }
    return Text(
      widget.material!.trim(),
      style: TextStyle(
        fontSize: fontSize.sp,
        height: QuestionMaterialCard.lineHeight,
        color: context.colors.text.withValues(alpha: 0.9),
        fontFamily: 'Noto Serif SC',
      ),
    );
  }
}

/// 布局完成后把子节点尺寸报给 [onChange]。
///
/// 报告走 post-frame 回调：`performLayout` 里 `setState` 会直接炸，
/// 而这里只关心「量到了多大」，晚一帧不影响观感（内容早就画出来了）。
class _MeasureSize extends SingleChildRenderObjectWidget {
  const _MeasureSize({required this.onChange, super.child});

  final ValueChanged<Size> onChange;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      _RenderMeasureSize(onChange);

  @override
  void updateRenderObject(
    BuildContext context,
    covariant _RenderMeasureSize renderObject,
  ) {
    renderObject.onChange = onChange;
  }
}

class _RenderMeasureSize extends RenderProxyBox {
  _RenderMeasureSize(this.onChange);

  ValueChanged<Size> onChange;

  Size? _reported;

  @override
  void performLayout() {
    super.performLayout();
    final size = this.size;
    if (_reported == size) return;
    _reported = size;
    SchedulerBinding.instance.addPostFrameCallback((_) => onChange(size));
  }
}
