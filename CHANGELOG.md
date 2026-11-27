# Changelog

## [2.0.0](https://github.com/jonahsnider/hoot-parser/compare/v1.1.0...v2.0.0) (2026-11-27)


### ⚠ BREAKING CHANGES

* C19 device signals are named `/Phoenix6/<bus>/<device>/<signal>`, ex. `/Phoenix6/rio/TalonFX-16/Velocity` instead of `/Phoenix6/TalonFX-16/Velocity`.

### Features

* name C19 device signals by their CAN bus ([2df8e09](https://github.com/jonahsnider/hoot-parser/commit/2df8e09a47860124c20b33072185f3299a12da01))

## [1.1.0](https://github.com/jonahsnider/hoot-parser/compare/v1.0.0...v1.1.0) (2026-11-25)


### Features

* match Owlet TalonFX signals in C21 logs ([db323b0](https://github.com/jonahsnider/hoot-parser/commit/db323b023b5468cae03bbe820ac1da9deaaca214))


### Performance Improvements

* speed up CAN signal decoding ([4a48615](https://github.com/jonahsnider/hoot-parser/commit/4a48615a5623c09e266fe1f90b7aab9f971929c6))

## 1.0.0 (2026-11-25)


### Features

* initial commit ([b5e95ad](https://github.com/jonahsnider/hoot-parser/commit/b5e95ad32ad7de67a9183326a0d00ff39dda1404))


### Performance Improvements

* buffer HOOT Huffman lookahead ([4c61a1c](https://github.com/jonahsnider/hoot-parser/commit/4c61a1c29363c2c1ffbcf5500992a413b9a90db6))
