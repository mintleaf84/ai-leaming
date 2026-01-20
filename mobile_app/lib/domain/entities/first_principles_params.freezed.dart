// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'first_principles_params.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$FirstPrinciplesParams {

 String get questionContent; String get correctAnswer; String? get explanation; String? get wrongAnswer;
/// Create a copy of FirstPrinciplesParams
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$FirstPrinciplesParamsCopyWith<FirstPrinciplesParams> get copyWith => _$FirstPrinciplesParamsCopyWithImpl<FirstPrinciplesParams>(this as FirstPrinciplesParams, _$identity);

  /// Serializes this FirstPrinciplesParams to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is FirstPrinciplesParams&&(identical(other.questionContent, questionContent) || other.questionContent == questionContent)&&(identical(other.correctAnswer, correctAnswer) || other.correctAnswer == correctAnswer)&&(identical(other.explanation, explanation) || other.explanation == explanation)&&(identical(other.wrongAnswer, wrongAnswer) || other.wrongAnswer == wrongAnswer));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,questionContent,correctAnswer,explanation,wrongAnswer);

@override
String toString() {
  return 'FirstPrinciplesParams(questionContent: $questionContent, correctAnswer: $correctAnswer, explanation: $explanation, wrongAnswer: $wrongAnswer)';
}


}

/// @nodoc
abstract mixin class $FirstPrinciplesParamsCopyWith<$Res>  {
  factory $FirstPrinciplesParamsCopyWith(FirstPrinciplesParams value, $Res Function(FirstPrinciplesParams) _then) = _$FirstPrinciplesParamsCopyWithImpl;
@useResult
$Res call({
 String questionContent, String correctAnswer, String? explanation, String? wrongAnswer
});




}
/// @nodoc
class _$FirstPrinciplesParamsCopyWithImpl<$Res>
    implements $FirstPrinciplesParamsCopyWith<$Res> {
  _$FirstPrinciplesParamsCopyWithImpl(this._self, this._then);

  final FirstPrinciplesParams _self;
  final $Res Function(FirstPrinciplesParams) _then;

/// Create a copy of FirstPrinciplesParams
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? questionContent = null,Object? correctAnswer = null,Object? explanation = freezed,Object? wrongAnswer = freezed,}) {
  return _then(_self.copyWith(
questionContent: null == questionContent ? _self.questionContent : questionContent // ignore: cast_nullable_to_non_nullable
as String,correctAnswer: null == correctAnswer ? _self.correctAnswer : correctAnswer // ignore: cast_nullable_to_non_nullable
as String,explanation: freezed == explanation ? _self.explanation : explanation // ignore: cast_nullable_to_non_nullable
as String?,wrongAnswer: freezed == wrongAnswer ? _self.wrongAnswer : wrongAnswer // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [FirstPrinciplesParams].
extension FirstPrinciplesParamsPatterns on FirstPrinciplesParams {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _FirstPrinciplesParams value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _FirstPrinciplesParams() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _FirstPrinciplesParams value)  $default,){
final _that = this;
switch (_that) {
case _FirstPrinciplesParams():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _FirstPrinciplesParams value)?  $default,){
final _that = this;
switch (_that) {
case _FirstPrinciplesParams() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String questionContent,  String correctAnswer,  String? explanation,  String? wrongAnswer)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _FirstPrinciplesParams() when $default != null:
return $default(_that.questionContent,_that.correctAnswer,_that.explanation,_that.wrongAnswer);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String questionContent,  String correctAnswer,  String? explanation,  String? wrongAnswer)  $default,) {final _that = this;
switch (_that) {
case _FirstPrinciplesParams():
return $default(_that.questionContent,_that.correctAnswer,_that.explanation,_that.wrongAnswer);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String questionContent,  String correctAnswer,  String? explanation,  String? wrongAnswer)?  $default,) {final _that = this;
switch (_that) {
case _FirstPrinciplesParams() when $default != null:
return $default(_that.questionContent,_that.correctAnswer,_that.explanation,_that.wrongAnswer);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _FirstPrinciplesParams implements FirstPrinciplesParams {
  const _FirstPrinciplesParams({required this.questionContent, required this.correctAnswer, this.explanation, this.wrongAnswer});
  factory _FirstPrinciplesParams.fromJson(Map<String, dynamic> json) => _$FirstPrinciplesParamsFromJson(json);

@override final  String questionContent;
@override final  String correctAnswer;
@override final  String? explanation;
@override final  String? wrongAnswer;

/// Create a copy of FirstPrinciplesParams
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$FirstPrinciplesParamsCopyWith<_FirstPrinciplesParams> get copyWith => __$FirstPrinciplesParamsCopyWithImpl<_FirstPrinciplesParams>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$FirstPrinciplesParamsToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _FirstPrinciplesParams&&(identical(other.questionContent, questionContent) || other.questionContent == questionContent)&&(identical(other.correctAnswer, correctAnswer) || other.correctAnswer == correctAnswer)&&(identical(other.explanation, explanation) || other.explanation == explanation)&&(identical(other.wrongAnswer, wrongAnswer) || other.wrongAnswer == wrongAnswer));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,questionContent,correctAnswer,explanation,wrongAnswer);

@override
String toString() {
  return 'FirstPrinciplesParams(questionContent: $questionContent, correctAnswer: $correctAnswer, explanation: $explanation, wrongAnswer: $wrongAnswer)';
}


}

/// @nodoc
abstract mixin class _$FirstPrinciplesParamsCopyWith<$Res> implements $FirstPrinciplesParamsCopyWith<$Res> {
  factory _$FirstPrinciplesParamsCopyWith(_FirstPrinciplesParams value, $Res Function(_FirstPrinciplesParams) _then) = __$FirstPrinciplesParamsCopyWithImpl;
@override @useResult
$Res call({
 String questionContent, String correctAnswer, String? explanation, String? wrongAnswer
});




}
/// @nodoc
class __$FirstPrinciplesParamsCopyWithImpl<$Res>
    implements _$FirstPrinciplesParamsCopyWith<$Res> {
  __$FirstPrinciplesParamsCopyWithImpl(this._self, this._then);

  final _FirstPrinciplesParams _self;
  final $Res Function(_FirstPrinciplesParams) _then;

/// Create a copy of FirstPrinciplesParams
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? questionContent = null,Object? correctAnswer = null,Object? explanation = freezed,Object? wrongAnswer = freezed,}) {
  return _then(_FirstPrinciplesParams(
questionContent: null == questionContent ? _self.questionContent : questionContent // ignore: cast_nullable_to_non_nullable
as String,correctAnswer: null == correctAnswer ? _self.correctAnswer : correctAnswer // ignore: cast_nullable_to_non_nullable
as String,explanation: freezed == explanation ? _self.explanation : explanation // ignore: cast_nullable_to_non_nullable
as String?,wrongAnswer: freezed == wrongAnswer ? _self.wrongAnswer : wrongAnswer // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

// dart format on
