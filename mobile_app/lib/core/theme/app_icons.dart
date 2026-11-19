import 'package:flutter/material.dart';
import 'package:material_symbols_icons/symbols.dart';

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

  static const IconData accessTime = Symbols.access_time_filled;  // 原 Icons.access_time
  static const IconData add = Symbols.add;  // 原 Icons.add
  static const IconData addCircleOutline = Symbols.add_circle_outline;  // 原 Icons.add_circle_outline
  static const IconData arrowBack = Symbols.arrow_back;  // 原 Icons.arrow_back
  static const IconData arrowBackIos = Symbols.arrow_back_ios;  // 原 Icons.arrow_back_ios
  static const IconData arrowForward = Symbols.arrow_forward;  // 原 Icons.arrow_forward
  static const IconData arrowForwardIos = Symbols.arrow_forward_ios;  // 原 Icons.arrow_forward_ios
  static const IconData archiveOutlined = Symbols.archive;  // 原 Icons.archive_outlined
  static const IconData book = Symbols.book;  // 原 Icons.book
  static const IconData bookOutlined = Symbols.book;  // 原 Icons.book_outlined
  static const IconData cancel = Symbols.cancel;  // 原 Icons.cancel

  /// 实心叉（判错标记）。
  ///
  /// **刻意不映射到 Symbols**：Material Symbols 的 `cancel` 只有"空心圆 + 斜杠"
  /// 一种形态，没有实心变体（不存在 `cancel_filled`），而同屏并排的
  /// `checkCircle`（`check_circle_filled`）是实心——一实一空看起来像两个不同族。
  /// 审计 #12：实心/空心混排。保留 Material Icons 的实心版本。
  static const IconData cancelSolid = Icons.cancel;
  static const IconData chatBubbleOutline = Symbols.chat_bubble_outline;  // 原 Icons.chat_bubble_outline
  static const IconData check = Symbols.check;  // 原 Icons.check
  static const IconData checkBox = Symbols.check_box;  // 原 Icons.check_box

  /// 实心复选框（"全选"已选中态）。
  ///
  /// **刻意不映射到 Symbols**：`Symbols.check_box` 只有描边方块，没有 filled 变体，
  /// 与同一行的 `check_box_outline_blank` 几乎看不出差别（点没点上分不清）。
  /// 审计 #12：实心/空心混排。保留 Material Icons 的实心版本。
  static const IconData checkBoxSolid = Icons.check_box;
  static const IconData checkBoxOutlineBlank = Symbols.check_box_outline_blank;  // 原 Icons.check_box_outline_blank
  static const IconData checkCircle = Symbols.check_circle_filled;  // 原 Icons.check_circle
  static const IconData checkCircleOutline = Symbols.check_circle_outline;  // 原 Icons.check_circle_outline
  static const IconData chevronLeft = Symbols.chevron_left;  // 原 Icons.chevron_left
  static const IconData chevronRight = Symbols.chevron_right;  // 原 Icons.chevron_right
  /// 实心小圆点（单选题"已选中"标记，10sp 白色叠在深色圆底上）。
  ///
  /// **刻意不映射到 Symbols**：`Symbols.circle` 是空心环，10sp 下只剩一圈发丝线，
  /// 在深色圆底上等于看不见（实测墨量只有原图标的 36%）。Material Symbols 里也没有
  /// 尺寸对得上的实心圆点（`fiber_manual_record` 直径太小），故保留 Material Icons。
  static const IconData dot = Icons.circle;
  static const IconData cleaningServicesOutlined = Symbols.cleaning_services;  // 原 Icons.cleaning_services_outlined
  static const IconData close = Symbols.close;  // 原 Icons.close
  static const IconData cloudOffOutlined = Symbols.cloud_off;  // 原 Icons.cloud_off_outlined
  static const IconData cloudUploadOutlined = Symbols.cloud_upload;  // 原 Icons.cloud_upload_outlined
  static const IconData darkModeOutlined = Symbols.dark_mode;  // 原 Icons.dark_mode_outlined
  static const IconData dashboard = Symbols.dashboard;  // 原 Icons.dashboard
  static const IconData deleteOutline = Symbols.delete_outline;  // 原 Icons.delete_outline
  static const IconData dnsOutlined = Symbols.dns;  // 原 Icons.dns_outlined
  static const IconData errorOutline = Symbols.error_outline;  // 原 Icons.error_outline
  static const IconData eventOutlined = Symbols.event;  // 原 Icons.event_outlined
  static const IconData expandMore = Symbols.expand_more;  // 原 Icons.expand_more
  static const IconData feedbackOutlined = Symbols.feedback;  // 原 Icons.feedback_outlined
  static const IconData filterAlt = Symbols.filter_alt;  // 原 Icons.filter_alt
  static const IconData filterAltOutlined = Symbols.filter_alt;  // 原 Icons.filter_alt_outlined
  static const IconData flagOutlined = Symbols.flag;  // 原 Icons.flag_outlined
  static const IconData formatListNumbered = Symbols.format_list_numbered;  // 原 Icons.format_list_numbered
  static const IconData history = Symbols.history;  // 原 Icons.history
  static const IconData hubOutlined = Symbols.hub;  // 原 Icons.hub_outlined
  static const IconData infoOutline = Symbols.info;  // 原 Icons.info_outline
  static const IconData keyboardArrowUp = Symbols.keyboard_arrow_up;  // 原 Icons.keyboard_arrow_up
  static const IconData libraryBooks = Symbols.library_books;  // 原 Icons.library_books
  static const IconData lightbulbOutline = Symbols.lightbulb_outline;  // 原 Icons.lightbulb_outline
  static const IconData localFireDepartmentOutlined = Symbols.local_fire_department;  // 原 Icons.local_fire_department_outlined
  static const IconData lockOutline = Symbols.lock_outline;  // 原 Icons.lock_outline
  static const IconData moreHoriz = Symbols.more_horiz;  // 原 Icons.more_horiz
  static const IconData notificationsOutlined = Symbols.notifications;  // 原 Icons.notifications_outlined
  static const IconData person = Symbols.person_filled;  // 原 Icons.person
  static const IconData personOutline = Symbols.person_outline;  // 原 Icons.person_outline
  static const IconData playCircleOutline = Symbols.play_circle;  // 原 Icons.play_circle_outline
  static const IconData radioButtonUnchecked = Symbols.radio_button_unchecked;  // 原 Icons.radio_button_unchecked
  static const IconData refresh = Symbols.refresh;  // 原 Icons.refresh
  static const IconData search = Symbols.search;  // 原 Icons.search
  static const IconData send = Symbols.send;  // 原 Icons.send
  static const IconData settingsOutlined = Symbols.settings;  // 原 Icons.settings_outlined
  static const IconData smartToy = Symbols.smart_toy;  // 原 Icons.smart_toy
  static const IconData stop = Symbols.stop;  // 原 Icons.stop
  static const IconData styleOutlined = Symbols.style;  // 原 Icons.style_outlined
  static const IconData subdirectoryArrowRight = Symbols.subdirectory_arrow_right;  // 原 Icons.subdirectory_arrow_right
  static const IconData swipeLeft = Symbols.swipe_left;  // 原 Icons.swipe_left
  static const IconData tune = Symbols.tune;  // 原 Icons.tune
  static const IconData viewCarouselOutlined = Symbols.view_carousel;  // 原 Icons.view_carousel_outlined
  static const IconData visibility = Symbols.visibility;  // 原 Icons.visibility
  static const IconData visibilityOff = Symbols.visibility_off;  // 原 Icons.visibility_off
  static const IconData workspacePremiumOutlined = Symbols.workspace_premium;  // 原 Icons.workspace_premium_outlined

  /// Material Symbols 没有品牌图标，Apple 登录按钮继续用 Material Icons。
  static const IconData apple = Icons.apple;
}
