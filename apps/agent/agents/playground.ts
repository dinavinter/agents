import {createMachine, emit} from "xstate";
import {render} from "../ui/render";
import {marked} from "marked";

export const machine = createMachine({
    entry: render(({html, event}) =>
        html`
            <zero-md>
                <script type="text/markdown" hx-ext="sse"
                        sse-swap="content" hx-swap="beforeend">
                    # **This** is my [markdown](https://example.com)
                    ## This is a subheading

                </script>
            </zero-md>
        `
    ),
    after: {
        40: {
            actions: emit({
                type: 'content',
                event: 'content',
                data: marked.parse('```csharp \n public void Test() { \n // write your test here} \n```')
            })
        },

        80: {
            actions: emit({
                type: 'content',
                event: 'content',
                data: converter.makeHtml('`var test = new Test();  `')
            })
        },
        90: {
            actions: emit({
                type: 'content',
                event: 'content',
                data: '```js  var test = new Test(); '
            })
        },

        100: {
            actions: emit({
                type: 'content',
                event: 'content',
                data: marked.parseInline(' test.doSomething(); \n')
            })
        },

        110: {
            actions: emit({
                type: 'content',
                event: 'content',
                data: marked.parseInline('test.doSomethingElse(); \n ')
            })
        },
        126: {
            actions: emit({
                type: 'content',
                event: 'content',
                data: '  ```'
            })
        }
    }


});