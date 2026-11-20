// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'history_provider.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;
/// @nodoc
mixin _$HistoryListState {

 List<HistoryItem> get items; int get total; int get page; int get pageSize; bool get isLoading; bool get hasMore; String? get error;
/// Create a copy of HistoryListState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$HistoryListStateCopyWith<HistoryListState> get copyWith => _$HistoryListStateCopyWithImpl<HistoryListState>(this as HistoryListState, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is HistoryListState&&const DeepCollectionEquality().equals(other.items, items)&&(identical(other.total, total) || other.total == total)&&(identical(other.page, page) || other.page == page)&&(identical(other.pageSize, pageSize) || other.pageSize == pageSize)&&(identical(other.isLoading, isLoading) || other.isLoading == isLoading)&&(identical(other.hasMore, hasMore) || other.hasMore == hasMore)&&(identical(other.error, error) || other.error == error));
}


@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(items),total,page,pageSize,isLoading,hasMore,error);

@override
String toString() {
  return 'HistoryListState(items: $items, total: $total, page: $page, pageSize: $pageSize, isLoading: $isLoading, hasMore: $hasMore, error: $error)';
}


}

/// @nodoc
abstract mixin class $HistoryListStateCopyWith<$Res>  {
  factory $HistoryListStateCopyWith(HistoryListState value, $Res Function(HistoryListState) _then) = _$HistoryListStateCopyWithImpl;
@useResult
$Res call({
 List<HistoryItem> items, int total, int page, int pageSize, bool isLoading, bool hasMore, String? error
});




}
/// @nodoc
class _$HistoryListStateCopyWithImpl<$Res>
    implements $HistoryListStateCopyWith<$Res> {
  _$HistoryListStateCopyWithImpl(this._self, this._then);

  final HistoryListState _self;
  final $Res Function(HistoryListState) _then;

/// Create a copy of HistoryListState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? items = null,Object? total = null,Object? page = null,Object? pageSize = null,Object? isLoading = null,Object? hasMore = null,Object? error = freezed,}) {
  return _then(_self.copyWith(
items: null == items ? _self.items : items // ignore: cast_nullable_to_non_nullable
as List<HistoryItem>,total: null == total ? _self.total : total // ignore: cast_nullable_to_non_nullable
as int,page: null == page ? _self.page : page // ignore: cast_nullable_to_non_nullable
as int,pageSize: null == pageSize ? _self.pageSize : pageSize // ignore: cast_nullable_to_non_nullable
as int,isLoading: null == isLoading ? _self.isLoading : isLoading // ignore: cast_nullable_to_non_nullable
as bool,hasMore: null == hasMore ? _self.hasMore : hasMore // ignore: cast_nullable_to_non_nullable
as bool,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [HistoryListState].
extension HistoryListStatePatterns on HistoryListState {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _HistoryListState value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _HistoryListState() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _HistoryListState value)  $default,){
final _that = this;
switch (_that) {
case _HistoryListState():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _HistoryListState value)?  $default,){
final _that = this;
switch (_that) {
case _HistoryListState() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( List<HistoryItem> items,  int total,  int page,  int pageSize,  bool isLoading,  bool hasMore,  String? error)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _HistoryListState() when $default != null:
return $default(_that.items,_that.total,_that.page,_that.pageSize,_that.isLoading,_that.hasMore,_that.error);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( List<HistoryItem> items,  int total,  int page,  int pageSize,  bool isLoading,  bool hasMore,  String? error)  $default,) {final _that = this;
switch (_that) {
case _HistoryListState():
return $default(_that.items,_that.total,_that.page,_that.pageSize,_that.isLoading,_that.hasMore,_that.error);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( List<HistoryItem> items,  int total,  int page,  int pageSize,  bool isLoading,  bool hasMore,  String? error)?  $default,) {final _that = this;
switch (_that) {
case _HistoryListState() when $default != null:
return $default(_that.items,_that.total,_that.page,_that.pageSize,_that.isLoading,_that.hasMore,_that.error);case _:
  return null;

}
}

}

/// @nodoc


class _HistoryListState implements HistoryListState {
  const _HistoryListState({final  List<HistoryItem> items = const [], this.total = 0, this.page = 1, this.pageSize = 10, this.isLoading = false, this.hasMore = true, this.error}): _items = items;
  

 final  List<HistoryItem> _items;
@override@JsonKey() List<HistoryItem> get items {
  if (_items is EqualUnmodifiableListView) return _items;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_items);
}

@override@JsonKey() final  int total;
@override@JsonKey() final  int page;
@override@JsonKey() final  int pageSize;
@override@JsonKey() final  bool isLoading;
@override@JsonKey() final  bool hasMore;
@override final  String? error;

/// Create a copy of HistoryListState
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$HistoryListStateCopyWith<_HistoryListState> get copyWith => __$HistoryListStateCopyWithImpl<_HistoryListState>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _HistoryListState&&const DeepCollectionEquality().equals(other._items, _items)&&(identical(other.total, total) || other.total == total)&&(identical(other.page, page) || other.page == page)&&(identical(other.pageSize, pageSize) || other.pageSize == pageSize)&&(identical(other.isLoading, isLoading) || other.isLoading == isLoading)&&(identical(other.hasMore, hasMore) || other.hasMore == hasMore)&&(identical(other.error, error) || other.error == error));
}


@override
int get hashCode => Object.hash(runtimeType,const DeepCollectionEquality().hash(_items),total,page,pageSize,isLoading,hasMore,error);

@override
String toString() {
  return 'HistoryListState(items: $items, total: $total, page: $page, pageSize: $pageSize, isLoading: $isLoading, hasMore: $hasMore, error: $error)';
}


}

/// @nodoc
abstract mixin class _$HistoryListStateCopyWith<$Res> implements $HistoryListStateCopyWith<$Res> {
  factory _$HistoryListStateCopyWith(_HistoryListState value, $Res Function(_HistoryListState) _then) = __$HistoryListStateCopyWithImpl;
@override @useResult
$Res call({
 List<HistoryItem> items, int total, int page, int pageSize, bool isLoading, bool hasMore, String? error
});




}
/// @nodoc
class __$HistoryListStateCopyWithImpl<$Res>
    implements _$HistoryListStateCopyWith<$Res> {
  __$HistoryListStateCopyWithImpl(this._self, this._then);

  final _HistoryListState _self;
  final $Res Function(_HistoryListState) _then;

/// Create a copy of HistoryListState
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? items = null,Object? total = null,Object? page = null,Object? pageSize = null,Object? isLoading = null,Object? hasMore = null,Object? error = freezed,}) {
  return _then(_HistoryListState(
items: null == items ? _self._items : items // ignore: cast_nullable_to_non_nullable
as List<HistoryItem>,total: null == total ? _self.total : total // ignore: cast_nullable_to_non_nullable
as int,page: null == page ? _self.page : page // ignore: cast_nullable_to_non_nullable
as int,pageSize: null == pageSize ? _self.pageSize : pageSize // ignore: cast_nullable_to_non_nullable
as int,isLoading: null == isLoading ? _self.isLoading : isLoading // ignore: cast_nullable_to_non_nullable
as bool,hasMore: null == hasMore ? _self.hasMore : hasMore // ignore: cast_nullable_to_non_nullable
as bool,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

/// @nodoc
mixin _$HistoryDetailState {

 HistoryItem? get session; List<PracticeLog> get logs; bool get isLoading; String? get error;
/// Create a copy of HistoryDetailState
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$HistoryDetailStateCopyWith<HistoryDetailState> get copyWith => _$HistoryDetailStateCopyWithImpl<HistoryDetailState>(this as HistoryDetailState, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is HistoryDetailState&&(identical(other.session, session) || other.session == session)&&const DeepCollectionEquality().equals(other.logs, logs)&&(identical(other.isLoading, isLoading) || other.isLoading == isLoading)&&(identical(other.error, error) || other.error == error));
}


@override
int get hashCode => Object.hash(runtimeType,session,const DeepCollectionEquality().hash(logs),isLoading,error);

@override
String toString() {
  return 'HistoryDetailState(session: $session, logs: $logs, isLoading: $isLoading, error: $error)';
}


}

/// @nodoc
abstract mixin class $HistoryDetailStateCopyWith<$Res>  {
  factory $HistoryDetailStateCopyWith(HistoryDetailState value, $Res Function(HistoryDetailState) _then) = _$HistoryDetailStateCopyWithImpl;
@useResult
$Res call({
 HistoryItem? session, List<PracticeLog> logs, bool isLoading, String? error
});


$HistoryItemCopyWith<$Res>? get session;

}
/// @nodoc
class _$HistoryDetailStateCopyWithImpl<$Res>
    implements $HistoryDetailStateCopyWith<$Res> {
  _$HistoryDetailStateCopyWithImpl(this._self, this._then);

  final HistoryDetailState _self;
  final $Res Function(HistoryDetailState) _then;

/// Create a copy of HistoryDetailState
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? session = freezed,Object? logs = null,Object? isLoading = null,Object? error = freezed,}) {
  return _then(_self.copyWith(
session: freezed == session ? _self.session : session // ignore: cast_nullable_to_non_nullable
as HistoryItem?,logs: null == logs ? _self.logs : logs // ignore: cast_nullable_to_non_nullable
as List<PracticeLog>,isLoading: null == isLoading ? _self.isLoading : isLoading // ignore: cast_nullable_to_non_nullable
as bool,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}
/// Create a copy of HistoryDetailState
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$HistoryItemCopyWith<$Res>? get session {
    if (_self.session == null) {
    return null;
  }

  return $HistoryItemCopyWith<$Res>(_self.session!, (value) {
    return _then(_self.copyWith(session: value));
  });
}
}


/// Adds pattern-matching-related methods to [HistoryDetailState].
extension HistoryDetailStatePatterns on HistoryDetailState {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _HistoryDetailState value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _HistoryDetailState() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _HistoryDetailState value)  $default,){
final _that = this;
switch (_that) {
case _HistoryDetailState():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _HistoryDetailState value)?  $default,){
final _that = this;
switch (_that) {
case _HistoryDetailState() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( HistoryItem? session,  List<PracticeLog> logs,  bool isLoading,  String? error)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _HistoryDetailState() when $default != null:
return $default(_that.session,_that.logs,_that.isLoading,_that.error);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( HistoryItem? session,  List<PracticeLog> logs,  bool isLoading,  String? error)  $default,) {final _that = this;
switch (_that) {
case _HistoryDetailState():
return $default(_that.session,_that.logs,_that.isLoading,_that.error);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( HistoryItem? session,  List<PracticeLog> logs,  bool isLoading,  String? error)?  $default,) {final _that = this;
switch (_that) {
case _HistoryDetailState() when $default != null:
return $default(_that.session,_that.logs,_that.isLoading,_that.error);case _:
  return null;

}
}

}

/// @nodoc


class _HistoryDetailState implements HistoryDetailState {
  const _HistoryDetailState({this.session, final  List<PracticeLog> logs = const [], this.isLoading = false, this.error}): _logs = logs;
  

@override final  HistoryItem? session;
 final  List<PracticeLog> _logs;
@override@JsonKey() List<PracticeLog> get logs {
  if (_logs is EqualUnmodifiableListView) return _logs;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_logs);
}

@override@JsonKey() final  bool isLoading;
@override final  String? error;

/// Create a copy of HistoryDetailState
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$HistoryDetailStateCopyWith<_HistoryDetailState> get copyWith => __$HistoryDetailStateCopyWithImpl<_HistoryDetailState>(this, _$identity);



@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _HistoryDetailState&&(identical(other.session, session) || other.session == session)&&const DeepCollectionEquality().equals(other._logs, _logs)&&(identical(other.isLoading, isLoading) || other.isLoading == isLoading)&&(identical(other.error, error) || other.error == error));
}


@override
int get hashCode => Object.hash(runtimeType,session,const DeepCollectionEquality().hash(_logs),isLoading,error);

@override
String toString() {
  return 'HistoryDetailState(session: $session, logs: $logs, isLoading: $isLoading, error: $error)';
}


}

/// @nodoc
abstract mixin class _$HistoryDetailStateCopyWith<$Res> implements $HistoryDetailStateCopyWith<$Res> {
  factory _$HistoryDetailStateCopyWith(_HistoryDetailState value, $Res Function(_HistoryDetailState) _then) = __$HistoryDetailStateCopyWithImpl;
@override @useResult
$Res call({
 HistoryItem? session, List<PracticeLog> logs, bool isLoading, String? error
});


@override $HistoryItemCopyWith<$Res>? get session;

}
/// @nodoc
class __$HistoryDetailStateCopyWithImpl<$Res>
    implements _$HistoryDetailStateCopyWith<$Res> {
  __$HistoryDetailStateCopyWithImpl(this._self, this._then);

  final _HistoryDetailState _self;
  final $Res Function(_HistoryDetailState) _then;

/// Create a copy of HistoryDetailState
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? session = freezed,Object? logs = null,Object? isLoading = null,Object? error = freezed,}) {
  return _then(_HistoryDetailState(
session: freezed == session ? _self.session : session // ignore: cast_nullable_to_non_nullable
as HistoryItem?,logs: null == logs ? _self._logs : logs // ignore: cast_nullable_to_non_nullable
as List<PracticeLog>,isLoading: null == isLoading ? _self.isLoading : isLoading // ignore: cast_nullable_to_non_nullable
as bool,error: freezed == error ? _self.error : error // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

/// Create a copy of HistoryDetailState
/// with the given fields replaced by the non-null parameter values.
@override
@pragma('vm:prefer-inline')
$HistoryItemCopyWith<$Res>? get session {
    if (_self.session == null) {
    return null;
  }

  return $HistoryItemCopyWith<$Res>(_self.session!, (value) {
    return _then(_self.copyWith(session: value));
  });
}
}

// dart format on
