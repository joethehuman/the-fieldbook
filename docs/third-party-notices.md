# Third-party source notices

Fieldbook owns and adapts its component source. Avatar, Card composition, Checkbox, Collapsible, Popover and Switch include adaptations of the public [shadcn/ui](https://github.com/shadcn-ui/ui) registry. Imports use the individual Radix packages already used by Fieldbook; styling and supported exports are tailored to this library. The adapted upstream portions retain their MIT license and notice below. Fieldbook's original code is licensed under [ELv2](../LICENSE). Dependencies retain their own licenses and notices.

## shadcn/ui

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Lexical selection synchronization

The pinned `lexical@0.48.0` dependency includes a narrow selection-synchronization backport from [Lexical PR #8931](https://github.com/facebook/lexical/pull/8931). The [dependency patch](../patches/lexical@0.48.0.patch) records programmatically applied selection endpoints so a stale acknowledgment flag cannot discard a later native cursor move. It includes equivalent source, development and production changes; the unrelated decorator-paint changes are excluded. pnpm applies this patch from the locked workspace configuration for both apps. When updating the editor dependencies, remove it only after verifying the upstream endpoint guard is included and native-selection regression checks pass.

Copyright (c) Meta Platforms, Inc. and affiliates. These upstream changes remain under the MIT terms reproduced above, together with Lexical's packaged license; they are not relicensed under ELv2.

## Code highlighting

Fieldbook uses [Highlight.js](https://github.com/highlightjs/highlight.js) for automatic language detection and reader syntax highlighting. It retains its BSD 3-Clause license; the complete [copyright notice and license](../public/licenses/highlightjs-bsd-3-clause.txt) ship with both apps at `/licenses/highlightjs-bsd-3-clause.txt`. CodeMirror and Lezer provide code editing and retain their MIT licenses and packaged notices. Preserve these dependency licenses when redistributing bundled software.

## Vercel AI SDK dependencies

The `ai` package and its `@ai-sdk/gateway`, `@ai-sdk/provider` and `@ai-sdk/provider-utils` dependencies retain their Apache-2.0 licenses and packaged notices. Fieldbook imports these packages; it does not relicense them under ELv2. Preserve the dependencies' license files when distributing bundled software. See the [AI SDK source](https://github.com/vercel/ai) and its [license](https://github.com/vercel/ai/blob/main/LICENSE).

## Vercel AI Elements and Streamdown

The message, message-content and streamed-response components in `components/ai-elements/message.tsx` are adapted from the [AI Elements message registry](https://elements.ai-sdk.dev/api/registry/message.json). Unused exports/plugins are omitted and memoization uses React's standard prop comparison. These upstream portions remain Apache-2.0; preserve their notice below. Fieldbook imports `streamdown` and `@ai-sdk/react`, which retain their Apache-2.0 licenses and packaged notices. Fieldbook's original application code remains ELv2.

The complete [Apache License 2.0](../public/licenses/apache-2.0.txt) is included with the source and served at `/licenses/apache-2.0.txt` by both the installed app and demo. Preserve it with the adapted code when redistributing Fieldbook.

Copyright 2023 Vercel, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

## Geist fonts

Fieldbook bundles Geist fonts through the `geist` package. The fonts retain the SIL Open Font License 1.1 and are not relicensed under ELv2. The complete [copyright notices and font license](../public/licenses/geist-ofl-1.1.txt) are included with the source and served at `/licenses/geist-ofl-1.1.txt` by both the installed app and demo.

The font files credit the Geist Project Authors (2024); the package license also credits Vercel, in collaboration with basement.studio (2023). Both notices are preserved in the distributed license copy. Standalone server output retains the package's `geist/LICENSE.txt` beside the traced font files and includes the public license copies. Preserve these files when redistributing the fonts or packaged application.
