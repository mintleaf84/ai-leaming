// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'history_item.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$HistoryItem {

 String get id; String? get sessionName; int get totalQuestions; int get correctCount; int get reviewCount; String get createdAt; int get accuracy; String? get practiceMode;
/// Create a copy of HistoryItem
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$HistoryItemCopyWith<HistoryItem> get copyWith => _$HistoryItemCopyWithImpl<HistoryItem>(this as HistoryItem, _$identity);

  /// Serializes this HistoryItem to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is HistoryItem&&(identical(other.id, id) || other.id == id)&&(identical(other.sessionName, sessionName) || other.sessionName == sessionName)&&(identical(other.totalQuestions, totalQuestions) || other.totalQuestions == totalQuestions)&&(identical(other.correctCount, correctCount) || other.correctCount == correctCount)&&(identical(other.reviewCount, reviewCount) || other.reviewCount == reviewCount)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.accuracy, accuracy) || other.accuracy == accuracy)&&(identical(other.practiceMode, practiceMode) || other.practiceMode == practiceMode));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,sessionName,totalQuestions,correctCount,reviewCount,createdAt,accuracy,practiceMode);

@override
String toString() {
  return 'HistoryItem(id: $id, sessionName: $sessionName, totalQuestions: $totalQuestions, correctCount: $correctCount, reviewCount: $reviewCount, createdAt: $createdAt, accuracy: $accuracy, practiceMode: $practiceMode)';
}


}

/// @nodoc
abstract mixin class $HistoryItemCopyWith<$Res>  {
  factory $HistoryItemCopyWith(HistoryItem value, $Res Function(HistoryItem) _then) = _$HistoryItemCopyWithImpl;
@useResult
$Res call({
 String id, String? sessionName, int totalQuestions, int correctCount, int reviewCount, String createdAt, int accuracy, String? practiceMode
});




}
/// @nodoc
class _$HistoryItemCopyWithImpl<$Res>
    implements $HistoryItemCopyWith<$Res> {
  _$HistoryItemCopyWithImpl(this._self, this._then);

  final HistoryItem _self;
  final $Res Function(HistoryItem) _then;

/// Create a copy of HistoryItem
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? id = null,Object? sessionName = freezed,Object? totalQuestions = null,Object? correctCount = null,Object? reviewCount = null,Object? createdAt = null,Object? accuracy = null,Object? practiceMode = freezed,}) {
  return _then(_self.copyWith(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,sessionName: freezed == sessionName ? _self.sessionName : sessionName // ignore: cast_nullable_to_non_nullable
as String?,totalQuestions: null == totalQuestions ? _self.totalQuestions : totalQuestions // ignore: cast_nullable_to_non_nullable
as int,correctCount: null == correctCount ? _self.correctCount : correctCount // ignore: cast_nullable_to_non_nullable
as int,reviewCount: null == reviewCount ? _self.reviewCount : reviewCount // ignore: cast_nullable_to_non_nullable
as int,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as String,accuracy: null == accuracy ? _self.accuracy : accuracy // ignore: cast_nullable_to_non_nullable
as int,practiceMode: freezed == practiceMode ? _self.practiceMode : practiceMode // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [HistoryItem].
extension HistoryItemPatterns on HistoryItem {
/// A variant of `map` that fallback to returning `orElse`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _HistoryItem value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _HistoryItem() when $default != null:
return $default(_that);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// Callbacks receives the raw object, upcasted.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case final Subclass2 value:
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _HistoryItem value)  $default,){
final _that = this;
switch (_that) {
case _HistoryItem():
return $default(_that);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `map` that fallback to returning `null`.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case final Subclass value:
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _HistoryItem value)?  $default,){
final _that = this;
switch (_that) {
case _HistoryItem() when $default != null:
return $default(_that);case _:
  return null;

}
}
/// A variant of `when` that fallback to an `orElse` callback.
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return orElse();
/// }
/// ```

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String id,  String? sessionName,  int totalQuestions,  int correctCount,  int reviewCount,  String createdAt,  int accuracy,  String? practiceMode)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _HistoryItem() when $default != null:
return $default(_that.id,_that.sessionName,_that.totalQuestions,_that.correctCount,_that.reviewCount,_that.createdAt,_that.accuracy,_that.practiceMode);case _:
  return orElse();

}
}
/// A `switch`-like method, using callbacks.
///
/// As opposed to `map`, this offers destructuring.
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case Subclass2(:final field2):
///     return ...;
/// }
/// ```

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String id,  String? sessionName,  int totalQuestions,  int correctCount,  int reviewCount,  String createdAt,  int accuracy,  String? practiceMode)  $default,) {final _that = this;
switch (_that) {
case _HistoryItem():
return $default(_that.id,_that.sessionName,_that.totalQuestions,_that.correctCount,_that.reviewCount,_that.createdAt,_that.accuracy,_that.practiceMode);case _:
  throw StateError('Unexpected subclass');

}
}
/// A variant of `when` that fallback to returning `null`
///
/// It is equivalent to doing:
/// ```dart
/// switch (sealedClass) {
///   case Subclass(:final field):
///     return ...;
///   case _:
///     return null;
/// }
/// ```

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String id,  String? sessionName,  int totalQuestions,  int correctCount,  int reviewCount,  String createdAt,  int accuracy,  String? practiceMode)?  $default,) {final _that = this;
switch (_that) {
case _HistoryItem() when $default != null:
return $default(_that.id,_that.sessionName,_that.totalQuestions,_that.correctCount,_that.reviewCount,_that.createdAt,_that.accuracy,_that.practiceMode);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _HistoryItem implements HistoryItem {
  const _HistoryItem({required this.id, this.sessionName, required this.totalQuestions, required this.correctCount, this.reviewCount = 0, required this.createdAt, required this.accuracy, this.practiceMode});
  factory _HistoryItem.fromJson(Map<String, dynamic> json) => _$HistoryItemFromJson(json);

@override final  String id;
@override final  String? sessionName;
@override final  int totalQuestions;
@override final  int correctCount;
@override@JsonKey() final  int reviewCount;
@override final  String createdAt;
@override final  int accuracy;
@override final  String? practiceMode;

/// Create a copy of HistoryItem
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$HistoryItemCopyWith<_HistoryItem> get copyWith => __$HistoryItemCopyWithImpl<_HistoryItem>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$HistoryItemToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _HistoryItem&&(identical(other.id, id) || other.id == id)&&(identical(other.sessionName, sessionName) || other.sessionName == sessionName)&&(identical(other.totalQuestions, totalQuestions) || other.totalQuestions == totalQuestions)&&(identical(other.correctCount, correctCount) || other.correctCount == correctCount)&&(identical(other.reviewCount, reviewCount) || other.reviewCount == reviewCount)&&(identical(other.createdAt, createdAt) || other.createdAt == createdAt)&&(identical(other.accuracy, accuracy) || other.accuracy == accuracy)&&(identical(other.practiceMode, practiceMode) || other.practiceMode == practiceMode));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,id,sessionName,totalQuestions,correctCount,reviewCount,createdAt,accuracy,practiceMode);

@override
String toString() {
  return 'HistoryItem(id: $id, sessionName: $sessionName, totalQuestions: $totalQuestions, correctCount: $correctCount, reviewCount: $reviewCount, createdAt: $createdAt, accuracy: $accuracy, practiceMode: $practiceMode)';
}


}

/// @nodoc
abstract mixin class _$HistoryItemCopyWith<$Res> implements $HistoryItemCopyWith<$Res> {
  factory _$HistoryItemCopyWith(_HistoryItem value, $Res Function(_HistoryItem) _then) = __$HistoryItemCopyWithImpl;
@override @useResult
$Res call({
 String id, String? sessionName, int totalQuestions, int correctCount, int reviewCount, String createdAt, int accuracy, String? practiceMode
});




}
/// @nodoc
class __$HistoryItemCopyWithImpl<$Res>
    implements _$HistoryItemCopyWith<$Res> {
  __$HistoryItemCopyWithImpl(this._self, this._then);

  final _HistoryItem _self;
  final $Res Function(_HistoryItem) _then;

/// Create a copy of HistoryItem
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? id = null,Object? sessionName = freezed,Object? totalQuestions = null,Object? correctCount = null,Object? reviewCount = null,Object? createdAt = null,Object? accuracy = null,Object? practiceMode = freezed,}) {
  return _then(_HistoryItem(
id: null == id ? _self.id : id // ignore: cast_nullable_to_non_nullable
as String,sessionName: freezed == sessionName ? _self.sessionName : sessionName // ignore: cast_nullable_to_non_nullable
as String?,totalQuestions: null == totalQuestions ? _self.totalQuestions : totalQuestions // ignore: cast_nullable_to_non_nullable
as int,correctCount: null == correctCount ? _self.correctCount : correctCount // ignore: cast_nullable_to_non_nullable
as int,reviewCount: null == reviewCount ? _self.reviewCount : reviewCount // ignore: cast_nullable_to_non_nullable
as int,createdAt: null == createdAt ? _self.createdAt : createdAt // ignore: cast_nullable_to_non_nullable
as String,accuracy: null == accuracy ? _self.accuracy : accuracy // ignore: cast_nullable_to_non_nullable
as int,practiceMode: freezed == practiceMode ? _self.practiceMode : practiceMode // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

// dart format on
