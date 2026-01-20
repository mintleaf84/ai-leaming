// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'first_principles_response.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$FirstPrinciplesResponse {

 String get analysis; bool get cached;
/// Create a copy of FirstPrinciplesResponse
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$FirstPrinciplesResponseCopyWith<FirstPrinciplesResponse> get copyWith => _$FirstPrinciplesResponseCopyWithImpl<FirstPrinciplesResponse>(this as FirstPrinciplesResponse, _$identity);

  /// Serializes this FirstPrinciplesResponse to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is FirstPrinciplesResponse&&(identical(other.analysis, analysis) || other.analysis == analysis)&&(identical(other.cached, cached) || other.cached == cached));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,analysis,cached);

@override
String toString() {
  return 'FirstPrinciplesResponse(analysis: $analysis, cached: $cached)';
}


}

/// @nodoc
abstract mixin class $FirstPrinciplesResponseCopyWith<$Res>  {
  factory $FirstPrinciplesResponseCopyWith(FirstPrinciplesResponse value, $Res Function(FirstPrinciplesResponse) _then) = _$FirstPrinciplesResponseCopyWithImpl;
@useResult
$Res call({
 String analysis, bool cached
});




}
/// @nodoc
class _$FirstPrinciplesResponseCopyWithImpl<$Res>
    implements $FirstPrinciplesResponseCopyWith<$Res> {
  _$FirstPrinciplesResponseCopyWithImpl(this._self, this._then);

  final FirstPrinciplesResponse _self;
  final $Res Function(FirstPrinciplesResponse) _then;

/// Create a copy of FirstPrinciplesResponse
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? analysis = null,Object? cached = null,}) {
  return _then(_self.copyWith(
analysis: null == analysis ? _self.analysis : analysis // ignore: cast_nullable_to_non_nullable
as String,cached: null == cached ? _self.cached : cached // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}

}


/// Adds pattern-matching-related methods to [FirstPrinciplesResponse].
extension FirstPrinciplesResponsePatterns on FirstPrinciplesResponse {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _FirstPrinciplesResponse value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _FirstPrinciplesResponse() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _FirstPrinciplesResponse value)  $default,){
final _that = this;
switch (_that) {
case _FirstPrinciplesResponse():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _FirstPrinciplesResponse value)?  $default,){
final _that = this;
switch (_that) {
case _FirstPrinciplesResponse() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String analysis,  bool cached)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _FirstPrinciplesResponse() when $default != null:
return $default(_that.analysis,_that.cached);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String analysis,  bool cached)  $default,) {final _that = this;
switch (_that) {
case _FirstPrinciplesResponse():
return $default(_that.analysis,_that.cached);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String analysis,  bool cached)?  $default,) {final _that = this;
switch (_that) {
case _FirstPrinciplesResponse() when $default != null:
return $default(_that.analysis,_that.cached);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _FirstPrinciplesResponse implements FirstPrinciplesResponse {
  const _FirstPrinciplesResponse({required this.analysis, required this.cached});
  factory _FirstPrinciplesResponse.fromJson(Map<String, dynamic> json) => _$FirstPrinciplesResponseFromJson(json);

@override final  String analysis;
@override final  bool cached;

/// Create a copy of FirstPrinciplesResponse
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$FirstPrinciplesResponseCopyWith<_FirstPrinciplesResponse> get copyWith => __$FirstPrinciplesResponseCopyWithImpl<_FirstPrinciplesResponse>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$FirstPrinciplesResponseToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _FirstPrinciplesResponse&&(identical(other.analysis, analysis) || other.analysis == analysis)&&(identical(other.cached, cached) || other.cached == cached));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,analysis,cached);

@override
String toString() {
  return 'FirstPrinciplesResponse(analysis: $analysis, cached: $cached)';
}


}

/// @nodoc
abstract mixin class _$FirstPrinciplesResponseCopyWith<$Res> implements $FirstPrinciplesResponseCopyWith<$Res> {
  factory _$FirstPrinciplesResponseCopyWith(_FirstPrinciplesResponse value, $Res Function(_FirstPrinciplesResponse) _then) = __$FirstPrinciplesResponseCopyWithImpl;
@override @useResult
$Res call({
 String analysis, bool cached
});




}
/// @nodoc
class __$FirstPrinciplesResponseCopyWithImpl<$Res>
    implements _$FirstPrinciplesResponseCopyWith<$Res> {
  __$FirstPrinciplesResponseCopyWithImpl(this._self, this._then);

  final _FirstPrinciplesResponse _self;
  final $Res Function(_FirstPrinciplesResponse) _then;

/// Create a copy of FirstPrinciplesResponse
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? analysis = null,Object? cached = null,}) {
  return _then(_FirstPrinciplesResponse(
analysis: null == analysis ? _self.analysis : analysis // ignore: cast_nullable_to_non_nullable
as String,cached: null == cached ? _self.cached : cached // ignore: cast_nullable_to_non_nullable
as bool,
  ));
}


}

// dart format on
