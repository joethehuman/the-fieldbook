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

## Vercel AI SDK dependencies

The `ai` package and its `@ai-sdk/gateway`, `@ai-sdk/provider` and `@ai-sdk/provider-utils` dependencies retain their Apache-2.0 licenses and packaged notices. Fieldbook imports these packages; it does not relicense them under ELv2. Preserve the dependencies' license files when distributing bundled software. See the [AI SDK source](https://github.com/vercel/ai) and its [license](https://github.com/vercel/ai/blob/main/LICENSE).

## Vercel AI Elements and Streamdown

The message, message-content and streamed-response components in `components/ai-elements/message.tsx` are adapted from the [AI Elements message registry](https://elements.ai-sdk.dev/api/registry/message.json). Unused exports/plugins are omitted and memoization uses React's standard prop comparison. These upstream portions remain Apache-2.0; preserve their notice below. Fieldbook imports `streamdown` and `@ai-sdk/react`, which retain their Apache-2.0 licenses and packaged notices. Fieldbook's original application code remains ELv2.

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
