import 'package:flutter/material.dart';

/// 移动端图标语义层（见 docs/mobile-ui-kit.md D-3 / M-09）。
///
/// 页面里**禁止**直接写 `IconData(...)` 或 `Icons.xxx`（`Icons.apple` 等 4 个例外除外），
/// 一律走这里：将来换图标集只改这一个文件。
///
/// ## 为什么不用 `material_symbols_icons` 包了
///
/// 那个包只提供**可变字体**（FILL/GRAD/opsz/wght 四个轴）。Flutter 3.38.4 的
/// `--tree-shake-icons` 在裁剪可变字体时会破坏 `gvar` 表（实测：子集字体 96 个字形里
/// 72 个解析抛 `IndexError: sharedTuples index out of range`），release 包在真机上
/// **整族图标全部不渲染**，而 `flutter analyze` / `flutter test` 都发现不了。
///
/// 解决办法：把用到的图标**实例化成静态字体**（`assets/fonts/AppSymbols.ttf`，
/// 57 个字形、9KB、无 gvar/fvar），静态字体再走子集化不会出问题。
/// 码点沿用 Material Symbols 原始值，便于和上游对照排查。
class AppIcons {
  AppIcons._();

  static const String _family = 'AppSymbols';

  static const IconData accessTime = IconData(0xEFD6, fontFamily: _family);  // access_time_filled  // 原 Icons.access_time
  static const IconData add = IconData(0xE145, fontFamily: _family);  // add  // 原 Icons.add
  static const IconData addCircleOutline = IconData(0xE990, fontFamily: _family);  // add_circle_outline  // 原 Icons.add_circle_outline
  static const IconData arrowBack = IconData(0xE5C4, fontFamily: _family);  // arrow_back  // 原 Icons.arrow_back
  static const IconData arrowBackIos = IconData(0xE5E0, fontFamily: _family);  // arrow_back_ios  // 原 Icons.arrow_back_ios
  static const IconData arrowForward = IconData(0xE5C8, fontFamily: _family);  // arrow_forward  // 原 Icons.arrow_forward
  static const IconData arrowForwardIos = IconData(0xE5E1, fontFamily: _family);  // arrow_forward_ios  // 原 Icons.arrow_forward_ios
  static const IconData archiveOutlined = IconData(0xE149, fontFamily: _family);  // archive  // 原 Icons.archive_outlined
  static const IconData book = IconData(0xE86E, fontFamily: _family);  // book  // 原 Icons.book
  static const IconData bookOutlined = IconData(0xE86E, fontFamily: _family);  // book  // 原 Icons.book_outlined
  static const IconData cancel = IconData(0xE888, fontFamily: _family);  // cancel  // 原 Icons.cancel
  static const IconData chatBubbleOutline = IconData(0xE0CB, fontFamily: _family);  // chat_bubble_outline  // 原 Icons.chat_bubble_outline
  static const IconData check = IconData(0xE668, fontFamily: _family);  // check  // 原 Icons.check
  static const IconData checkBox = IconData(0xE9DE, fontFamily: _family);  // check_box  // 原 Icons.check_box
  static const IconData checkBoxOutlineBlank = IconData(0xE835, fontFamily: _family);  // check_box_outline_blank  // 原 Icons.check_box_outline_blank
  static const IconData checkCircle = IconData(0xF0BE, fontFamily: _family);  // check_circle_filled  // 原 Icons.check_circle
  static const IconData checkCircleOutline = IconData(0xF0BE, fontFamily: _family);  // check_circle_outline  // 原 Icons.check_circle_outline
  static const IconData chevronLeft = IconData(0xE5CB, fontFamily: _family);  // chevron_left  // 原 Icons.chevron_left
  static const IconData chevronRight = IconData(0xE5CC, fontFamily: _family);  // chevron_right  // 原 Icons.chevron_right
  static const IconData cleaningServicesOutlined = IconData(0xF0FF, fontFamily: _family);  // cleaning_services  // 原 Icons.cleaning_services_outlined
  static const IconData close = IconData(0xE5CD, fontFamily: _family);  // close  // 原 Icons.close
  static const IconData cloudOffOutlined = IconData(0xE2C1, fontFamily: _family);  // cloud_off  // 原 Icons.cloud_off_outlined
  static const IconData cloudUploadOutlined = IconData(0xE2C3, fontFamily: _family);  // cloud_upload  // 原 Icons.cloud_upload_outlined
  static const IconData darkModeOutlined = IconData(0xE51C, fontFamily: _family);  // dark_mode  // 原 Icons.dark_mode_outlined
  static const IconData dashboard = IconData(0xE871, fontFamily: _family);  // dashboard  // 原 Icons.dashboard
  static const IconData deleteOutline = IconData(0xE92E, fontFamily: _family);  // delete_outline  // 原 Icons.delete_outline
  static const IconData dnsOutlined = IconData(0xE875, fontFamily: _family);  // dns  // 原 Icons.dns_outlined
  static const IconData errorOutline = IconData(0xF8B6, fontFamily: _family);  // error_outline  // 原 Icons.error_outline
  static const IconData eventOutlined = IconData(0xE878, fontFamily: _family);  // event  // 原 Icons.event_outlined
  static const IconData expandMore = IconData(0xE5CF, fontFamily: _family);  // expand_more  // 原 Icons.expand_more
  static const IconData feedbackOutlined = IconData(0xE87F, fontFamily: _family);  // feedback  // 原 Icons.feedback_outlined
  static const IconData filterAlt = IconData(0xEF4F, fontFamily: _family);  // filter_alt  // 原 Icons.filter_alt
  static const IconData filterAltOutlined = IconData(0xEF4F, fontFamily: _family);  // filter_alt  // 原 Icons.filter_alt_outlined
  static const IconData flagOutlined = IconData(0xF0C6, fontFamily: _family);  // flag  // 原 Icons.flag_outlined
  static const IconData formatListNumbered = IconData(0xE242, fontFamily: _family);  // format_list_numbered  // 原 Icons.format_list_numbered
  static const IconData history = IconData(0xE8B3, fontFamily: _family);  // history  // 原 Icons.history
  static const IconData hubOutlined = IconData(0xE9F4, fontFamily: _family);  // hub  // 原 Icons.hub_outlined
  static const IconData infoOutline = IconData(0xE88E, fontFamily: _family);  // info  // 原 Icons.info_outline
  static const IconData keyboardArrowUp = IconData(0xE316, fontFamily: _family);  // keyboard_arrow_up  // 原 Icons.keyboard_arrow_up
  static const IconData libraryBooks = IconData(0xE02F, fontFamily: _family);  // library_books  // 原 Icons.library_books
  static const IconData lightbulbOutline = IconData(0xE90F, fontFamily: _family);  // lightbulb_outline  // 原 Icons.lightbulb_outline
  static const IconData localFireDepartmentOutlined = IconData(0xEF55, fontFamily: _family);  // local_fire_department  // 原 Icons.local_fire_department_outlined
  static const IconData lockOutline = IconData(0xE899, fontFamily: _family);  // lock_outline  // 原 Icons.lock_outline
  static const IconData moreHoriz = IconData(0xE5D3, fontFamily: _family);  // more_horiz  // 原 Icons.more_horiz
  static const IconData notificationsOutlined = IconData(0xE7F5, fontFamily: _family);  // notifications  // 原 Icons.notifications_outlined
  static const IconData person = IconData(0xF0D3, fontFamily: _family);  // person_filled  // 原 Icons.person
  static const IconData personOutline = IconData(0xF0D3, fontFamily: _family);  // person_outline  // 原 Icons.person_outline
  static const IconData playCircleOutline = IconData(0xE1C4, fontFamily: _family);  // play_circle  // 原 Icons.play_circle_outline
  static const IconData radioButtonUnchecked = IconData(0xE836, fontFamily: _family);  // radio_button_unchecked  // 原 Icons.radio_button_unchecked
  static const IconData refresh = IconData(0xE5D5, fontFamily: _family);  // refresh  // 原 Icons.refresh
  static const IconData search = IconData(0xEF7A, fontFamily: _family);  // search  // 原 Icons.search
  static const IconData send = IconData(0xE163, fontFamily: _family);  // send  // 原 Icons.send
  static const IconData settingsOutlined = IconData(0xE8B8, fontFamily: _family);  // settings  // 原 Icons.settings_outlined
  static const IconData smartToy = IconData(0xF06C, fontFamily: _family);  // smart_toy  // 原 Icons.smart_toy
  static const IconData stop = IconData(0xE047, fontFamily: _family);  // stop  // 原 Icons.stop
  static const IconData styleOutlined = IconData(0xE41D, fontFamily: _family);  // style  // 原 Icons.style_outlined
  static const IconData subdirectoryArrowRight = IconData(0xE5DA, fontFamily: _family);  // subdirectory_arrow_right  // 原 Icons.subdirectory_arrow_right
  static const IconData swipeLeft = IconData(0xEB59, fontFamily: _family);  // swipe_left  // 原 Icons.swipe_left
  static const IconData tune = IconData(0xE429, fontFamily: _family);  // tune  // 原 Icons.tune
  static const IconData viewCarouselOutlined = IconData(0xE8EB, fontFamily: _family);  // view_carousel  // 原 Icons.view_carousel_outlined
  static const IconData visibility = IconData(0xE8F4, fontFamily: _family);  // visibility  // 原 Icons.visibility
  static const IconData visibilityOff = IconData(0xE8F5, fontFamily: _family);  // visibility_off  // 原 Icons.visibility_off
  static const IconData workspacePremiumOutlined = IconData(0xE7AF, fontFamily: _family);  // workspace_premium  // 原 Icons.workspace_premium_outlined


  /// 实心小圆点（单选题「已选中」标记）。Symbols 里是空心环，10sp 下看不见。
  static const IconData dot = Icons.circle;

  /// 实心叉（判错标记）。Symbols 的 cancel 是空心，和实心对勾并排会一实一空。
  static const IconData cancelSolid = Icons.cancel;

  /// 实心方框勾（全选）。同上。
  static const IconData checkBoxSolid = Icons.check_box;

  /// Material Symbols 没有品牌图标，Apple 登录按钮继续用 Material Icons。
  static const IconData apple = Icons.apple;
}
