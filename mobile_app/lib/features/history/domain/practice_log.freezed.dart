// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'practice_log.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$PracticeLog {

 int get questionId; String get questionContent; List<String> get options; String get correctAnswer; String get userAnswer; bool get isCorrect; int get duration; List<String> get tags; String get explanation; String? get aiMnemonic;
/// Create a copy of PracticeLog
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PracticeLogCopyWith<PracticeLog> get copyWith => _$PracticeLogCopyWithImpl<PracticeLog>(this as PracticeLog, _$identity);

  /// Serializes this PracticeLog to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PracticeLog&&(identical(other.questionId, questionId) || other.questionId == questionId)&&(identical(other.questionContent, questionContent) || other.questionContent == questionContent)&&const DeepCollectionEquality().equals(other.options, options)&&(identical(other.correctAnswer, correctAnswer) || other.correctAnswer == correctAnswer)&&(identical(other.userAnswer, userAnswer) || other.userAnswer == userAnswer)&&(identical(other.isCorrect, isCorrect) || other.isCorrect == isCorrect)&&(identical(other.duration, duration) || other.duration == duration)&&const DeepCollectionEquality().equals(other.tags, tags)&&(identical(other.explanation, explanation) || other.explanation == explanation)&&(identical(other.aiMnemonic, aiMnemonic) || other.aiMnemonic == aiMnemonic));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,questionId,questionContent,const DeepCollectionEquality().hash(options),correctAnswer,userAnswer,isCorrect,duration,const DeepCollectionEquality().hash(tags),explanation,aiMnemonic);

@override
String toString() {
  return 'PracticeLog(questionId: $questionId, questionContent: $questionContent, options: $options, correctAnswer: $correctAnswer, userAnswer: $userAnswer, isCorrect: $isCorrect, duration: $duration, tags: $tags, explanation: $explanation, aiMnemonic: $aiMnemonic)';
}


}

/// @nodoc
abstract mixin class $PracticeLogCopyWith<$Res>  {
  factory $PracticeLogCopyWith(PracticeLog value, $Res Function(PracticeLog) _then) = _$PracticeLogCopyWithImpl;
@useResult
$Res call({
 int questionId, String questionContent, List<String> options, String correctAnswer, String userAnswer, bool isCorrect, int duration, List<String> tags, String explanation, String? aiMnemonic
});




}
/// @nodoc
class _$PracticeLogCopyWithImpl<$Res>
    implements $PracticeLogCopyWith<$Res> {
  _$PracticeLogCopyWithImpl(this._self, this._then);

  final PracticeLog _self;
  final $Res Function(PracticeLog) _then;

/// Create a copy of PracticeLog
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? questionId = null,Object? questionContent = null,Object? options = null,Object? correctAnswer = null,Object? userAnswer = null,Object? isCorrect = null,Object? duration = null,Object? tags = null,Object? explanation = null,Object? aiMnemonic = freezed,}) {
  return _then(_self.copyWith(
questionId: null == questionId ? _self.questionId : questionId // ignore: cast_nullable_to_non_nullable
as int,questionContent: null == questionContent ? _self.questionContent : questionContent // ignore: cast_nullable_to_non_nullable
as String,options: null == options ? _self.options : options // ignore: cast_nullable_to_non_nullable
as List<String>,correctAnswer: null == correctAnswer ? _self.correctAnswer : correctAnswer // ignore: cast_nullable_to_non_nullable
as String,userAnswer: null == userAnswer ? _self.userAnswer : userAnswer // ignore: cast_nullable_to_non_nullable
as String,isCorrect: null == isCorrect ? _self.isCorrect : isCorrect // ignore: cast_nullable_to_non_nullable
as bool,duration: null == duration ? _self.duration : duration // ignore: cast_nullable_to_non_nullable
as int,tags: null == tags ? _self.tags : tags // ignore: cast_nullable_to_non_nullable
as List<String>,explanation: null == explanation ? _self.explanation : explanation // ignore: cast_nullable_to_non_nullable
as String,aiMnemonic: freezed == aiMnemonic ? _self.aiMnemonic : aiMnemonic // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}

}


/// Adds pattern-matching-related methods to [PracticeLog].
extension PracticeLogPatterns on PracticeLog {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PracticeLog value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PracticeLog() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PracticeLog value)  $default,){
final _that = this;
switch (_that) {
case _PracticeLog():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PracticeLog value)?  $default,){
final _that = this;
switch (_that) {
case _PracticeLog() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( int questionId,  String questionContent,  List<String> options,  String correctAnswer,  String userAnswer,  bool isCorrect,  int duration,  List<String> tags,  String explanation,  String? aiMnemonic)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PracticeLog() when $default != null:
return $default(_that.questionId,_that.questionContent,_that.options,_that.correctAnswer,_that.userAnswer,_that.isCorrect,_that.duration,_that.tags,_that.explanation,_that.aiMnemonic);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( int questionId,  String questionContent,  List<String> options,  String correctAnswer,  String userAnswer,  bool isCorrect,  int duration,  List<String> tags,  String explanation,  String? aiMnemonic)  $default,) {final _that = this;
switch (_that) {
case _PracticeLog():
return $default(_that.questionId,_that.questionContent,_that.options,_that.correctAnswer,_that.userAnswer,_that.isCorrect,_that.duration,_that.tags,_that.explanation,_that.aiMnemonic);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( int questionId,  String questionContent,  List<String> options,  String correctAnswer,  String userAnswer,  bool isCorrect,  int duration,  List<String> tags,  String explanation,  String? aiMnemonic)?  $default,) {final _that = this;
switch (_that) {
case _PracticeLog() when $default != null:
return $default(_that.questionId,_that.questionContent,_that.options,_that.correctAnswer,_that.userAnswer,_that.isCorrect,_that.duration,_that.tags,_that.explanation,_that.aiMnemonic);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PracticeLog implements PracticeLog {
  const _PracticeLog({required this.questionId, required this.questionContent, required final  List<String> options, required this.correctAnswer, required this.userAnswer, required this.isCorrect, required this.duration, required final  List<String> tags, required this.explanation, this.aiMnemonic}): _options = options,_tags = tags;
  factory _PracticeLog.fromJson(Map<String, dynamic> json) => _$PracticeLogFromJson(json);

@override final  int questionId;
@override final  String questionContent;
 final  List<String> _options;
@override List<String> get options {
  if (_options is EqualUnmodifiableListView) return _options;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_options);
}

@override final  String correctAnswer;
@override final  String userAnswer;
@override final  bool isCorrect;
@override final  int duration;
 final  List<String> _tags;
@override List<String> get tags {
  if (_tags is EqualUnmodifiableListView) return _tags;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_tags);
}

@override final  String explanation;
@override final  String? aiMnemonic;

/// Create a copy of PracticeLog
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PracticeLogCopyWith<_PracticeLog> get copyWith => __$PracticeLogCopyWithImpl<_PracticeLog>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PracticeLogToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PracticeLog&&(identical(other.questionId, questionId) || other.questionId == questionId)&&(identical(other.questionContent, questionContent) || other.questionContent == questionContent)&&const DeepCollectionEquality().equals(other._options, _options)&&(identical(other.correctAnswer, correctAnswer) || other.correctAnswer == correctAnswer)&&(identical(other.userAnswer, userAnswer) || other.userAnswer == userAnswer)&&(identical(other.isCorrect, isCorrect) || other.isCorrect == isCorrect)&&(identical(other.duration, duration) || other.duration == duration)&&const DeepCollectionEquality().equals(other._tags, _tags)&&(identical(other.explanation, explanation) || other.explanation == explanation)&&(identical(other.aiMnemonic, aiMnemonic) || other.aiMnemonic == aiMnemonic));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,questionId,questionContent,const DeepCollectionEquality().hash(_options),correctAnswer,userAnswer,isCorrect,duration,const DeepCollectionEquality().hash(_tags),explanation,aiMnemonic);

@override
String toString() {
  return 'PracticeLog(questionId: $questionId, questionContent: $questionContent, options: $options, correctAnswer: $correctAnswer, userAnswer: $userAnswer, isCorrect: $isCorrect, duration: $duration, tags: $tags, explanation: $explanation, aiMnemonic: $aiMnemonic)';
}


}

/// @nodoc
abstract mixin class _$PracticeLogCopyWith<$Res> implements $PracticeLogCopyWith<$Res> {
  factory _$PracticeLogCopyWith(_PracticeLog value, $Res Function(_PracticeLog) _then) = __$PracticeLogCopyWithImpl;
@override @useResult
$Res call({
 int questionId, String questionContent, List<String> options, String correctAnswer, String userAnswer, bool isCorrect, int duration, List<String> tags, String explanation, String? aiMnemonic
});




}
/// @nodoc
class __$PracticeLogCopyWithImpl<$Res>
    implements _$PracticeLogCopyWith<$Res> {
  __$PracticeLogCopyWithImpl(this._self, this._then);

  final _PracticeLog _self;
  final $Res Function(_PracticeLog) _then;

/// Create a copy of PracticeLog
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? questionId = null,Object? questionContent = null,Object? options = null,Object? correctAnswer = null,Object? userAnswer = null,Object? isCorrect = null,Object? duration = null,Object? tags = null,Object? explanation = null,Object? aiMnemonic = freezed,}) {
  return _then(_PracticeLog(
questionId: null == questionId ? _self.questionId : questionId // ignore: cast_nullable_to_non_nullable
as int,questionContent: null == questionContent ? _self.questionContent : questionContent // ignore: cast_nullable_to_non_nullable
as String,options: null == options ? _self._options : options // ignore: cast_nullable_to_non_nullable
as List<String>,correctAnswer: null == correctAnswer ? _self.correctAnswer : correctAnswer // ignore: cast_nullable_to_non_nullable
as String,userAnswer: null == userAnswer ? _self.userAnswer : userAnswer // ignore: cast_nullable_to_non_nullable
as String,isCorrect: null == isCorrect ? _self.isCorrect : isCorrect // ignore: cast_nullable_to_non_nullable
as bool,duration: null == duration ? _self.duration : duration // ignore: cast_nullable_to_non_nullable
as int,tags: null == tags ? _self._tags : tags // ignore: cast_nullable_to_non_nullable
as List<String>,explanation: null == explanation ? _self.explanation : explanation // ignore: cast_nullable_to_non_nullable
as String,aiMnemonic: freezed == aiMnemonic ? _self.aiMnemonic : aiMnemonic // ignore: cast_nullable_to_non_nullable
as String?,
  ));
}


}

// dart format on
