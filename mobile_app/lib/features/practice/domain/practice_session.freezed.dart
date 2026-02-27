// GENERATED CODE - DO NOT MODIFY BY HAND
// coverage:ignore-file
// ignore_for_file: type=lint
// ignore_for_file: unused_element, deprecated_member_use, deprecated_member_use_from_same_package, use_function_type_syntax_for_parameters, unnecessary_const, avoid_init_to_null, invalid_override_different_default_values_named, prefer_expression_function_bodies, annotate_overrides, invalid_annotation_target, unnecessary_question_mark

part of 'practice_session.dart';

// **************************************************************************
// FreezedGenerator
// **************************************************************************

// dart format off
T _$identity<T>(T value) => value;

/// @nodoc
mixin _$PracticeSession {

 String get sessionId; List<Question> get questions;
/// Create a copy of PracticeSession
/// with the given fields replaced by the non-null parameter values.
@JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
$PracticeSessionCopyWith<PracticeSession> get copyWith => _$PracticeSessionCopyWithImpl<PracticeSession>(this as PracticeSession, _$identity);

  /// Serializes this PracticeSession to a JSON map.
  Map<String, dynamic> toJson();


@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is PracticeSession&&(identical(other.sessionId, sessionId) || other.sessionId == sessionId)&&const DeepCollectionEquality().equals(other.questions, questions));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,sessionId,const DeepCollectionEquality().hash(questions));

@override
String toString() {
  return 'PracticeSession(sessionId: $sessionId, questions: $questions)';
}


}

/// @nodoc
abstract mixin class $PracticeSessionCopyWith<$Res>  {
  factory $PracticeSessionCopyWith(PracticeSession value, $Res Function(PracticeSession) _then) = _$PracticeSessionCopyWithImpl;
@useResult
$Res call({
 String sessionId, List<Question> questions
});




}
/// @nodoc
class _$PracticeSessionCopyWithImpl<$Res>
    implements $PracticeSessionCopyWith<$Res> {
  _$PracticeSessionCopyWithImpl(this._self, this._then);

  final PracticeSession _self;
  final $Res Function(PracticeSession) _then;

/// Create a copy of PracticeSession
/// with the given fields replaced by the non-null parameter values.
@pragma('vm:prefer-inline') @override $Res call({Object? sessionId = null,Object? questions = null,}) {
  return _then(_self.copyWith(
sessionId: null == sessionId ? _self.sessionId : sessionId // ignore: cast_nullable_to_non_nullable
as String,questions: null == questions ? _self.questions : questions // ignore: cast_nullable_to_non_nullable
as List<Question>,
  ));
}

}


/// Adds pattern-matching-related methods to [PracticeSession].
extension PracticeSessionPatterns on PracticeSession {
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

@optionalTypeArgs TResult maybeMap<TResult extends Object?>(TResult Function( _PracticeSession value)?  $default,{required TResult orElse(),}){
final _that = this;
switch (_that) {
case _PracticeSession() when $default != null:
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

@optionalTypeArgs TResult map<TResult extends Object?>(TResult Function( _PracticeSession value)  $default,){
final _that = this;
switch (_that) {
case _PracticeSession():
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

@optionalTypeArgs TResult? mapOrNull<TResult extends Object?>(TResult? Function( _PracticeSession value)?  $default,){
final _that = this;
switch (_that) {
case _PracticeSession() when $default != null:
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

@optionalTypeArgs TResult maybeWhen<TResult extends Object?>(TResult Function( String sessionId,  List<Question> questions)?  $default,{required TResult orElse(),}) {final _that = this;
switch (_that) {
case _PracticeSession() when $default != null:
return $default(_that.sessionId,_that.questions);case _:
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

@optionalTypeArgs TResult when<TResult extends Object?>(TResult Function( String sessionId,  List<Question> questions)  $default,) {final _that = this;
switch (_that) {
case _PracticeSession():
return $default(_that.sessionId,_that.questions);case _:
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

@optionalTypeArgs TResult? whenOrNull<TResult extends Object?>(TResult? Function( String sessionId,  List<Question> questions)?  $default,) {final _that = this;
switch (_that) {
case _PracticeSession() when $default != null:
return $default(_that.sessionId,_that.questions);case _:
  return null;

}
}

}

/// @nodoc
@JsonSerializable()

class _PracticeSession implements PracticeSession {
  const _PracticeSession({required this.sessionId, required final  List<Question> questions}): _questions = questions;
  factory _PracticeSession.fromJson(Map<String, dynamic> json) => _$PracticeSessionFromJson(json);

@override final  String sessionId;
 final  List<Question> _questions;
@override List<Question> get questions {
  if (_questions is EqualUnmodifiableListView) return _questions;
  // ignore: implicit_dynamic_type
  return EqualUnmodifiableListView(_questions);
}


/// Create a copy of PracticeSession
/// with the given fields replaced by the non-null parameter values.
@override @JsonKey(includeFromJson: false, includeToJson: false)
@pragma('vm:prefer-inline')
_$PracticeSessionCopyWith<_PracticeSession> get copyWith => __$PracticeSessionCopyWithImpl<_PracticeSession>(this, _$identity);

@override
Map<String, dynamic> toJson() {
  return _$PracticeSessionToJson(this, );
}

@override
bool operator ==(Object other) {
  return identical(this, other) || (other.runtimeType == runtimeType&&other is _PracticeSession&&(identical(other.sessionId, sessionId) || other.sessionId == sessionId)&&const DeepCollectionEquality().equals(other._questions, _questions));
}

@JsonKey(includeFromJson: false, includeToJson: false)
@override
int get hashCode => Object.hash(runtimeType,sessionId,const DeepCollectionEquality().hash(_questions));

@override
String toString() {
  return 'PracticeSession(sessionId: $sessionId, questions: $questions)';
}


}

/// @nodoc
abstract mixin class _$PracticeSessionCopyWith<$Res> implements $PracticeSessionCopyWith<$Res> {
  factory _$PracticeSessionCopyWith(_PracticeSession value, $Res Function(_PracticeSession) _then) = __$PracticeSessionCopyWithImpl;
@override @useResult
$Res call({
 String sessionId, List<Question> questions
});




}
/// @nodoc
class __$PracticeSessionCopyWithImpl<$Res>
    implements _$PracticeSessionCopyWith<$Res> {
  __$PracticeSessionCopyWithImpl(this._self, this._then);

  final _PracticeSession _self;
  final $Res Function(_PracticeSession) _then;

/// Create a copy of PracticeSession
/// with the given fields replaced by the non-null parameter values.
@override @pragma('vm:prefer-inline') $Res call({Object? sessionId = null,Object? questions = null,}) {
  return _then(_PracticeSession(
sessionId: null == sessionId ? _self.sessionId : sessionId // ignore: cast_nullable_to_non_nullable
as String,questions: null == questions ? _self._questions : questions // ignore: cast_nullable_to_non_nullable
as List<Question>,
  ));
}


}

// dart format on
