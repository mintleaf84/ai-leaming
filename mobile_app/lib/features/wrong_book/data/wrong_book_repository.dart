// 过渡转发（一期）：`WrongBookRepository` / `wrongBookRepositoryProvider` /
// `wrongBookTotalProvider` 已上提到 `lib/shared/repositories/wrong_book_repository.dart`
// （wrong_book / practice / dashboard 三处共用，原位置让 feature 反向 import）。
// 二期删除本文件并把引用改到
// `package:mobile_app/shared/repositories/wrong_book_repository.dart`。
export 'package:mobile_app/shared/repositories/wrong_book_repository.dart';
