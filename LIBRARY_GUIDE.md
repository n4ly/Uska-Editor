# Library 스크립트 가이드

`library` 타입은 같은 그룹의 `instant` · `key` · `gesture` 스크립트가 실행되기 직전에 코드를 자동으로 prepend합니다.  
ES 모듈 스타일의 `export` / `import` 구문을 지원하므로, 공통 유틸리티 함수를 한 곳에 모아두고 여러 스크립트에서 재사용할 수 있습니다.

---

## 기본 사용법

### 1. 라이브러리 스크립트 만들기

**Add Script → library** 선택 후 이름과 코드를 입력합니다.

```js
// 라이브러리 이름: utils
export function greet(name) {
    return `Hello, ${name}!`
}

export const VERSION = '1.0'

export default function log(msg) {
    console.log('[uska]', msg)
}
```

> **이름 필드는 필수입니다.** import 구문에서 `uska:<이름>` 형태로 참조합니다.

### 2. 스크립트에서 import하기

같은 그룹의 `instant` / `key` / `gesture` 스크립트에서 아래처럼 불러옵니다.

```js
// Named import
import { greet, VERSION } from 'uska:utils'
console.log(greet('World'))  // Hello, World!
console.log(VERSION)          // 1.0

// Default import
import log from 'uska:utils'
log('hello')  // [uska] hello

// Namespace import
import * as utils from 'uska:utils'
console.log(utils.greet('everyone'))
console.log(utils.__default)  // default export 함수
```

---

## 지원하는 export 문법

```js
export function foo() {}            // ✅ 함수 export
export async function bar() {}      // ✅ async 함수 export
export class MyClass {}             // ✅ 클래스 export
export const VALUE = 42             // ✅ const/let/var export
export default function foo() {}    // ✅ default 함수 export (이름 필수)
export default class Foo {}         // ✅ default 클래스 export (이름 필수)
```

## 지원하는 import 문법

```js
import { foo, bar } from 'uska:libName'        // ✅ Named import
import { foo as f } from 'uska:libName'        // ✅ Alias import
import * as lib from 'uska:libName'            // ✅ Namespace import
import defaultFn from 'uska:libName'           // ✅ Default import
```

---

## 제한 사항

다음 패턴은 **지원하지 않으며** 사용 시 SyntaxError가 발생합니다.

```js
// ❌ export list 형식
function foo() {}
export { foo }

// ❌ 익명 default export
export default function() {}
export default () => {}
export default { a: 1 }
export default myVar        // 변수 참조

// ❌ 비구조화 export
export const { a, b } = obj
export const [x, y] = arr
```

다중 선언은 첫 번째 변수만 레지스트리에 등록됩니다.

```js
// ⚠️ a만 import 가능, b는 불가
export const a = 1, b = 2
```

혼합 import는 두 줄로 분리해 사용하세요.

```js
// ❌
import defaultFn, { helper } from 'uska:utils'

// ✅
import defaultFn from 'uska:utils'
import { helper } from 'uska:utils'
```

---

## 동작 원리

라이브러리 코드는 IIFE로 감싸져 스크립트에 prepend됩니다. 실제 주입되는 코드 구조는 다음과 같습니다.

```js
// ── 주입 코드 (자동 생성) ──────────────────────────
var __uskaLib_utils = (() => {
    function greet(name) { return `Hello, ${name}!` }
    const VERSION = '1.0'
    function log(msg) { console.log('[uska]', msg) }
    return { greet, VERSION, log, __default: log }
})()

// ── 사용자 스크립트 ────────────────────────────────
var { greet, VERSION } = __uskaLib_utils
console.log(greet('World'))
```

- 라이브러리 변수는 IIFE 내부에 격리되어 전역 스코프를 오염시키지 않습니다.
- 다른 그룹의 라이브러리와는 공유되지 않습니다.
- 라이브러리 스크립트 자체는 독립 실행되지 않습니다.
