# PDF fonts

Inter (400, 600) and Fraunces (600), the design system's typefaces, for server-side PDFs
(`src/lib/pdf/kit.ts`). SIL Open Font License 1.1: see `OFL-Inter.txt` and `OFL-Fraunces.txt`.

The files are Latin subsets (Basic Latin, Latin-1, Latin Extended-A, Norwegian and common
punctuation), about 44 KB each, so a document renders in tens of milliseconds and stays small.
Made from the static TTFs in `@expo-google-fonts/inter@0.4.2` and `@expo-google-fonts/fraunces@0.4.1`
with fonttools 4.55.3:

```sh
pyftsubset <font>.ttf --output-file=<name>.ttf --layout-features=kern --no-hinting --desubroutinize \
  --unicodes="U+0020-007E,U+00A0-00FF,U+0100-017F,U+0218-021B,U+02C6-02DD,U+2009-200B,U+2010-2027,U+202F,U+2030-203A,U+2044,U+20AC,U+2122,U+2190-2193,U+2212,U+2713"
```
