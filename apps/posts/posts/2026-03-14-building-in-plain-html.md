# Building in Plain HTML

There's something refreshing about building web apps without a framework. No `node_modules`, no bundler config, no waiting for builds. Just open a file and start writing.

## Why vanilla?

- **Zero dependencies** — nothing to install, nothing to break
- **Instant feedback** — save the file, refresh the browser
- **Full control** — you understand every line because you wrote it
- **Longevity** — plain HTML from 2005 still works today

## The trade-offs

You give up convenience. There's no component system, no reactive state, no hot module replacement. You write more boilerplate. You repeat yourself sometimes.

But for small, focused apps — a clock, a game, a reader like this one — the trade-off is worth it.

> Simplicity is the ultimate sophistication.

## A minimal example

Here's everything you need for a working web app:

```
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>My App</title>
</head>
<body>
    <h1>Hello</h1>
    <script>
        document.querySelector("h1").textContent = "It works.";
    </script>
</body>
</html>
```

No compilation step. No transpiling. Just **HTML, CSS, and JavaScript** — the original stack.

---

That's the philosophy behind this project. Every app here is built the same way: a directory with a few plain files, a service worker for offline use, and nothing else.
