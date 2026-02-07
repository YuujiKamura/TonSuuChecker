# プロジェクト固有のルール

## プリコミット設計レビュー

`ai-code-review` (`C:\Users\yuuji\ai-code-review`) の pre-commit hook でコミット前に自動設計レビューを実行する。

- フックは `review --hook` で staged diff を AI に投げ、`⚠` が含まれるとコミットをブロックする
- インストール: `review --hook-install`
- 手動実行: `review --hook --backend gemini`

## クォータエラー判定

APIエラーのクォータ判定には `isQuotaError()` 関数を使用すること（geminiService.ts）。

## カメラ解像度

デフォルトでCALS 100万画素（1280×960）を使用。
