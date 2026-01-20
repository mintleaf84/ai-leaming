import 'package:flutter_riverpod/flutter_riverpod.dart';

enum ReviewMode {
  list, // 清单模式
  immersive, // 沉浸模式
}

class SettingsState {
  final ReviewMode reviewMode;

  const SettingsState({this.reviewMode = ReviewMode.list});

  SettingsState copyWith({ReviewMode? reviewMode}) {
    return SettingsState(reviewMode: reviewMode ?? this.reviewMode);
  }
}

class SettingsNotifier extends Notifier<SettingsState> {
  @override
  SettingsState build() {
    return const SettingsState();
  }

  void setReviewMode(ReviewMode mode) {
    state = state.copyWith(reviewMode: mode);
  }
}

final settingsProvider = NotifierProvider<SettingsNotifier, SettingsState>(
  SettingsNotifier.new,
);
