# Getting Started

Here's how this blog works behind the scenes.

## The stack

Everything runs on vanilla HTML, CSS, and JavaScript. No frameworks, no build step. Posts are plain `.md` files served as static assets.

### Adding a post

1. Write a markdown file
2. Add an entry to `posts/index.json`
3. Deploy

That's the entire workflow.

## Markdown support

The reader handles the basics:

- **Bold** and *italic* text
- `Inline code` and fenced code blocks
- Links, images, blockquotes
- Ordered and unordered lists

Here's a code example:

```
function hello() {
    console.log("Hello from a code block");
}
```

---

The reader also has a **dark mode** toggle and font size controls — try the buttons in the toolbar.
