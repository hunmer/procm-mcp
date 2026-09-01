// Environment accessor that works on VM (dart:io) and web.
export 'env_stub.dart' if (dart.library.io) 'env_io.dart';
