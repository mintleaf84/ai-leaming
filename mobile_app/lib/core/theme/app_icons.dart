import 'package:flutter/material.dart';

/// 移动端图标语义层（见 docs/mobile-ui-kit.md D-3 / M-09）。
///
/// 页面里**禁止**直接写 `Symbols.xxx` 或 `Icons.xxx`（`Icons.apple` 除外——Material
/// Symbols 没有品牌图标），一律走这里：将来换图标集只改这一个文件。
///
/// 取值原则是尽量保持替换前的观感——原来用实心 `Icons.x` 的映射到 Symbols 的
/// `x_filled`（该图标没有 filled 变体时退回默认 outlined），原来用 `Icons.x_outlined`
/// 的映射到 Symbols 的 outlined 基名。
class AppIcons {
  AppIcons._();

  /// 图标字体家族：`assets/fonts/AppSymbols.ttf`（Material Symbols 的**静态实例**）。
  ///
  /// 为什么不再用 `material_symbols_icons` 包：它只提供可变字体，而 Flutter 3.38.4 的
  /// `--tree-shake-icons` 裁剪可变字体时会破坏 `gvar` 表（实测子集 96 个字形里 72 个
  /// 解析抛 `IndexError: sharedTuples index out of range`），release 包在真机上
  /// **整族图标不渲染**。详见 docs/mobile-ui-icons-exceptions.md §5。
  ///
  /// 码点沿用 Material Symbols 原值，便于与上游对照。
  static const String _family = 'AppSymbols';

  static const IconData accessTime = IconData(0xEFD6, fontFamily: _family);  // 原 Icons.access_time
  static const IconData add = IconData(0xE145, fontFamily: _family);  // 原 Icons.add
  static const IconData addCircleOutline = IconData(0xE990, fontFamily: _family);  // 原 Icons.add_circle_outline
  static const IconData arrowBack = IconData(0xE5C4, fontFamily: _family);  // 原 Icons.arrow_back
  static const IconData arrowBackIos = IconData(0xE5E0, fontFamily: _family);  // 原 Icons.arrow_back_ios
  static const IconData arrowForward = IconData(0xE5C8, fontFamily: _family);  // 原 Icons.arrow_forward
  static const IconData arrowForwardIos = IconData(0xE5E1, fontFamily: _family);  // 原 Icons.arrow_forward_ios
  static const IconData archiveOutlined = IconData(0xE149, fontFamily: _family);  // 原 Icons.archive_outlined
  static const IconData book = IconData(0xE86E, fontFamily: _family);  // 原 Icons.book
  static const IconData bookOutlined = IconData(0xE86E, fontFamily: _family);  // 原 Icons.book_outlined
  static const IconData cancel = IconData(0xE888, fontFamily: _family);  // 原 Icons.cancel

  /// 实心叉（判错标记）。
  ///
  /// **刻意不映射到 Symbols**：Material Symbols 的 `cancel` 只有"空心圆 + 斜杠"
  /// 一种形态，没有实心变体（不存在 `cancel_filled`），而同屏并排的
  /// `checkCircle`（`check_circle_filled`）是实心——一实一空看起来像两个不同族。
  /// 审计 #12：实心/空心混排。保留 Material Icons 的实心版本。
  static const IconData cancelSolid = Icons.cancel;
  static const IconData chatBubbleOutline = IconData(0xE0CB, fontFamily: _family);  // 原 Icons.chat_bubble_outline
  static const IconData check = IconData(0xE668, fontFamily: _family);  // 原 Icons.check
  static const IconData checkBox = IconData(0xE9DE, fontFamily: _family);  // 原 Icons.check_box

  /// 实心复选框（"全选"已选中态）。
  ///
  /// **刻意不映射到 Symbols**：`Symbols.check_box` 只有描边方块，没有 filled 变体，
  /// 与同一行的 `check_box_outline_blank` 几乎看不出差别（点没点上分不清）。
  /// 审计 #12：实心/空心混排。保留 Material Icons 的实心版本。
  static const IconData checkBoxSolid = Icons.check_box;
  static const IconData checkBoxOutlineBlank = IconData(0xE835, fontFamily: _family);  // 原 Icons.check_box_outline_blank
  static const IconData checkCircle = IconData(0xF0BE, fontFamily: _family);  // 原 Icons.check_circle
  static const IconData checkCircleOutline = IconData(0xF0BE, fontFamily: _family);  // 原 Icons.check_circle_outline
  static const IconData chevronLeft = IconData(0xE5CB, fontFamily: _family);  // 原 Icons.chevron_left
  static const IconData chevronRight = IconData(0xE5CC, fontFamily: _family);  // 原 Icons.chevron_right
  /// 实心小圆点（单选题"已选中"标记，10sp 白色叠在深色圆底上）。
  ///
  /// **刻意不映射到 Symbols**：`Symbols.circle` 是空心环，10sp 下只剩一圈发丝线，
  /// 在深色圆底上等于看不见（实测墨量只有原图标的 36%）。Material Symbols 里也没有
  /// 尺寸对得上的实心圆点（`fiber_manual_record` 直径太小），故保留 Material Icons。
  static const IconData dot = Icons.circle;
  static const IconData cleaningServicesOutlined = IconData(0xF0FF, fontFamily: _family);  // 原 Icons.cleaning_services_outlined
  static const IconData close = IconData(0xE5CD, fontFamily: _family);  // 原 Icons.close
  static const IconData cloudOffOutlined = IconData(0xE2C1, fontFamily: _family);  // 原 Icons.cloud_off_outlined
  static const IconData cloudUploadOutlined = IconData(0xE2C3, fontFamily: _family);  // 原 Icons.cloud_upload_outlined
  static const IconData darkModeOutlined = IconData(0xE51C, fontFamily: _family);  // 原 Icons.dark_mode_outlined
  static const IconData dashboard = IconData(0xE871, fontFamily: _family);  // 原 Icons.dashboard
  static const IconData deleteOutline = IconData(0xE92E, fontFamily: _family);  // 原 Icons.delete_outline
  static const IconData dnsOutlined = IconData(0xE875, fontFamily: _family);  // 原 Icons.dns_outlined
  static const IconData errorOutline = IconData(0xF8B6, fontFamily: _family);  // 原 Icons.error_outline
  static const IconData eventOutlined = IconData(0xE878, fontFamily: _family);  // 原 Icons.event_outlined
  static const IconData expandLess = IconData(0xE5CE, fontFamily: _family);  // 原 Icons.expand_less
  static const IconData expandMore = IconData(0xE5CF, fontFamily: _family);  // 原 Icons.expand_more
  static const IconData feedbackOutlined = IconData(0xE87F, fontFamily: _family);  // 原 Icons.feedback_outlined
  static const IconData filterAlt = IconData(0xEF4F, fontFamily: _family);  // 原 Icons.filter_alt
  static const IconData filterAltOutlined = IconData(0xEF4F, fontFamily: _family);  // 原 Icons.filter_alt_outlined
  static const IconData flagOutlined = IconData(0xF0C6, fontFamily: _family);  // 原 Icons.flag_outlined
  static const IconData formatListNumbered = IconData(0xE242, fontFamily: _family);  // 原 Icons.format_list_numbered
  static const IconData history = IconData(0xE8B3, fontFamily: _family);  // 原 Icons.history
  static const IconData hubOutlined = IconData(0xE9F4, fontFamily: _family);  // 原 Icons.hub_outlined
  static const IconData infoOutline = IconData(0xE88E, fontFamily: _family);  // 原 Icons.info_outline
  static const IconData keyboardArrowUp = IconData(0xE316, fontFamily: _family);  // 原 Icons.keyboard_arrow_up
  static const IconData libraryBooks = IconData(0xE02F, fontFamily: _family);  // 原 Icons.library_books
  static const IconData lightbulbOutline = IconData(0xE90F, fontFamily: _family);  // 原 Icons.lightbulb_outline
  static const IconData localFireDepartmentOutlined = IconData(0xEF55, fontFamily: _family);  // 原 Icons.local_fire_department_outlined
  static const IconData lockOutline = IconData(0xE899, fontFamily: _family);  // 原 Icons.lock_outline
  static const IconData moreHoriz = IconData(0xE5D3, fontFamily: _family);  // 原 Icons.more_horiz
  static const IconData notificationsOutlined = IconData(0xE7F5, fontFamily: _family);  // 原 Icons.notifications_outlined
  static const IconData person = IconData(0xF0D3, fontFamily: _family);  // 原 Icons.person
  static const IconData personOutline = IconData(0xF0D3, fontFamily: _family);  // 原 Icons.person_outline
  static const IconData playCircleOutline = IconData(0xE1C4, fontFamily: _family);  // 原 Icons.play_circle_outline
  static const IconData radioButtonUnchecked = IconData(0xE836, fontFamily: _family);  // 原 Icons.radio_button_unchecked
  static const IconData refresh = IconData(0xE5D5, fontFamily: _family);  // 原 Icons.refresh
  static const IconData search = IconData(0xEF7A, fontFamily: _family);  // 原 Icons.search
  static const IconData send = IconData(0xE163, fontFamily: _family);  // 原 Icons.send
  static const IconData settingsOutlined = IconData(0xE8B8, fontFamily: _family);  // 原 Icons.settings_outlined
  static const IconData smartToy = IconData(0xF06C, fontFamily: _family);  // 原 Icons.smart_toy
  static const IconData stop = IconData(0xE047, fontFamily: _family);  // 原 Icons.stop
  static const IconData styleOutlined = IconData(0xE41D, fontFamily: _family);  // 原 Icons.style_outlined
  static const IconData subdirectoryArrowRight = IconData(0xE5DA, fontFamily: _family);  // 原 Icons.subdirectory_arrow_right
  static const IconData swipeLeft = IconData(0xEB59, fontFamily: _family);  // 原 Icons.swipe_left
  static const IconData tune = IconData(0xE429, fontFamily: _family);  // 原 Icons.tune
  static const IconData viewCarouselOutlined = IconData(0xE8EB, fontFamily: _family);  // 原 Icons.view_carousel_outlined
  static const IconData visibility = IconData(0xE8F4, fontFamily: _family);  // 原 Icons.visibility
  static const IconData visibilityOff = IconData(0xE8F5, fontFamily: _family);  // 原 Icons.visibility_off
  static const IconData workspacePremiumOutlined = IconData(0xE7AF, fontFamily: _family);  // 原 Icons.workspace_premium_outlined

  /// Material Symbols 没有品牌图标，Apple 登录按钮继续用 Material Icons。
  static const IconData apple = Icons.apple;
}
