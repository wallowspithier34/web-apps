// Lightweight markdown-to-HTML renderer
// Handles: headings, paragraphs, bold, italic, inline code, code blocks,
// links, images, blockquotes, lists (ul/ol), horizontal rules

window.renderMarkdown = function (src) {
    var lines = src.split("\n");
    var html = "";
    var i = 0;

    while (i < lines.length) {
        var line = lines[i];

        // Fenced code block
        if (line.startsWith("```")) {
            i++;
            var code = "";
            while (i < lines.length && !lines[i].startsWith("```")) {
                code += esc(lines[i]) + "\n";
                i++;
            }
            i++; // skip closing fence
            html += "<pre><code>" + code + "</code></pre>";
            continue;
        }

        // Heading
        var hm = line.match(/^(#{1,6})\s+(.+)/);
        if (hm) {
            var lvl = hm[1].length;
            html += "<h" + lvl + ">" + inline(hm[2]) + "</h" + lvl + ">";
            i++;
            continue;
        }

        // Horizontal rule
        if (/^(---|\*\*\*|___)$/.test(line.trim())) {
            html += "<hr>";
            i++;
            continue;
        }

        // Blockquote
        if (line.startsWith("> ")) {
            var bq = "";
            while (i < lines.length && lines[i].startsWith("> ")) {
                bq += lines[i].slice(2) + " ";
                i++;
            }
            html += "<blockquote><p>" + inline(bq.trim()) + "</p></blockquote>";
            continue;
        }

        // Unordered list
        if (/^[-*]\s/.test(line)) {
            html += "<ul>";
            while (i < lines.length && /^[-*]\s/.test(lines[i])) {
                html += "<li>" + inline(lines[i].replace(/^[-*]\s/, "")) + "</li>";
                i++;
            }
            html += "</ul>";
            continue;
        }

        // Ordered list
        if (/^\d+\.\s/.test(line)) {
            html += "<ol>";
            while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
                html += "<li>" + inline(lines[i].replace(/^\d+\.\s/, "")) + "</li>";
                i++;
            }
            html += "</ol>";
            continue;
        }

        // Blank line
        if (line.trim() === "") {
            i++;
            continue;
        }

        // Paragraph — accumulate consecutive non-blank, non-block lines
        var para = "";
        while (i < lines.length && lines[i].trim() !== "" && !isBlock(lines[i])) {
            para += (para ? " " : "") + lines[i];
            i++;
        }
        html += "<p>" + inline(para) + "</p>";
    }

    return html;
};

// Check if a line starts a block element
function isBlock(line) {
    return /^(#{1,6}\s|```|>\s|[-*]\s|\d+\.\s|---$|\*\*\*$|___$)/.test(line.trim());
}

// HTML-escape special characters
function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Inline formatting: code spans first (to protect contents), then images, links, bold, italic
function inline(s) {
    // Code spans — replace first to protect contents
    s = s.replace(/`([^`]+)`/g, function (_, code) {
        return "<code>" + esc(code) + "</code>";
    });
    // Images
    s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    // Links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Bold+italic
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
    // Bold
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
    // Italic
    s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
    s = s.replace(/_(.+?)_/g, "<em>$1</em>");
    return s;
}
