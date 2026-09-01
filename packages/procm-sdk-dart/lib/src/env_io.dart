import 'dart:io';

/// VM / Flutter native environment lookup.
String? procmEnv(String name) => Platform.environment[name];
