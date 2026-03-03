<script lang="ts">
  import { EditorView, WidgetType, Decoration } from "@codemirror/view";
  import {
    EditorState,
    StateField,
    StateEffect,
    Transaction,
    type Extension,
  } from "@codemirror/state";
  import { typst as typstLang } from "codemirror-lang-typst";
  import { xml } from "@codemirror/lang-xml";
  import { yaml } from "@codemirror/lang-yaml";
  import { json } from "@codemirror/lang-json";
  import { markdown } from "@codemirror/lang-markdown";
  import { StreamLanguage } from "@codemirror/language";
  import { toml } from "@codemirror/legacy-modes/mode/toml";
  import { stex } from "@codemirror/legacy-modes/mode/stex";
  import {
    lineNumbers,
    highlightActiveLine,
    highlightSpecialChars,
    drawSelection,
    gutter,
    GutterMarker,
  } from "@codemirror/view";
  import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
  import { tags } from "@lezer/highlight";

  interface Props {
    content: string;
    filename?: string;
    commentLines?: Set<number>;
    pendingLine?: number | null;
    onlinegutterclick?: (line: number) => void;
    oncursorchange?: (line: number) => void;
    oncommentsubmit?: (body: string) => void;
    oncancelpending?: () => void;
  }

  let {
    content,
    filename,
    commentLines = new Set(),
    pendingLine = null,
    onlinegutterclick,
    oncursorchange,
    oncommentsubmit,
    oncancelpending,
  }: Props = $props();

  function getLanguageExtension(name?: string): Extension {
    if (!name) return typstLang();
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")).toLowerCase() : "";
    switch (ext) {
      case ".typ":
        return typstLang();
      case ".xml":
      case ".csl":
      case ".xsl":
      case ".xslt":
      case ".html":
      case ".svg":
        return xml();
      case ".yaml":
      case ".yml":
        return yaml();
      case ".json":
        return json();
      case ".md":
      case ".mdx":
        return markdown();
      case ".toml":
        return StreamLanguage.define(toml);
      case ".bib":
      case ".tex":
      case ".sty":
      case ".cls":
        return StreamLanguage.define(stex);
      default:
        return [];
    }
  }

  let view: EditorView | undefined = $state();

  /** Scroll the editor to a specific line number (1-based). */
  export function scrollToLine(line: number) {
    if (!view) return;
    const doc = view.state.doc;
    if (line < 1 || line > doc.lines) return;
    const lineInfo = doc.line(line);
    view.dispatch({
      selection: { anchor: lineInfo.from },
      effects: EditorView.scrollIntoView(lineInfo.from, { y: "center" }),
    });
  }

  // --- Gutter markers ---

  class CommentMarker extends GutterMarker {
    toDOM() {
      const el = document.createElement("span");
      el.className = "cm-comment-marker";
      el.textContent = "\u{1F4AC}";
      return el;
    }
  }

  class AddMarker extends GutterMarker {
    toDOM() {
      const el = document.createElement("span");
      el.className = "cm-add-comment";
      el.textContent = "+";
      return el;
    }
  }

  const commentMarker = new CommentMarker();
  const addMarker = new AddMarker();

  // --- Comment lines state field (synced from prop) ---

  const setCommentLines = StateEffect.define<Set<number>>();
  const commentLinesField = StateField.define<Set<number>>({
    create: () => new Set(),
    update(value, tr) {
      for (const e of tr.effects) {
        if (e.is(setCommentLines)) return e.value;
      }
      return value;
    },
  });

  // --- Inline comment widget ---

  const setPendingLine = StateEffect.define<number | null>();

  class InlineCommentWidget extends WidgetType {
    submitFn: (body: string) => void;
    cancelFn: () => void;

    constructor(submitFn: (body: string) => void, cancelFn: () => void) {
      super();
      this.submitFn = submitFn;
      this.cancelFn = cancelFn;
    }

    toDOM() {
      const { submitFn, cancelFn } = this;
      const wrapper = document.createElement("div");
      wrapper.className = "cm-inline-comment";

      const textarea = document.createElement("textarea");
      textarea.placeholder = "Write a comment...";
      textarea.rows = 3;
      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          const body = textarea.value.trim();
          if (body) submitFn(body);
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancelFn();
        }
      });
      wrapper.appendChild(textarea);

      const actions = document.createElement("div");
      actions.className = "cm-inline-comment-actions";

      const submitBtn = document.createElement("button");
      submitBtn.textContent = "Comment";
      submitBtn.className = "cm-inline-comment-submit";
      submitBtn.addEventListener("click", () => {
        const body = textarea.value.trim();
        if (body) submitFn(body);
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "Cancel";
      cancelBtn.className = "cm-inline-comment-cancel";
      cancelBtn.addEventListener("click", () => cancelFn());

      actions.appendChild(submitBtn);
      actions.appendChild(cancelBtn);
      wrapper.appendChild(actions);

      requestAnimationFrame(() => textarea.focus());

      return wrapper;
    }

    ignoreEvent() {
      return true;
    }

    eq() {
      return false;
    }
  }

  function makePendingDecorations(state: EditorState, lineNum: number | null) {
    if (lineNum == null || lineNum < 1 || lineNum > state.doc.lines) {
      return Decoration.none;
    }
    const line = state.doc.line(lineNum);
    const widget = new InlineCommentWidget(
      (body) => oncommentsubmit?.(body),
      () => oncancelpending?.(),
    );
    return Decoration.set([
      Decoration.line({ class: "cm-comment-pending-line" }).range(line.from),
      Decoration.widget({ widget, block: true, side: 1 }).range(line.to),
    ]);
  }

  const inlineCommentField = StateField.define({
    create: () => Decoration.none,
    update(decos, tr) {
      for (const e of tr.effects) {
        if (e.is(setPendingLine)) {
          return makePendingDecorations(tr.state, e.value);
        }
      }
      return decos.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  // --- Row hover tracking (DOM class on gutter element) ---
  // CSS :hover only fires on the narrow gutter column itself. To show "+"
  // when hovering anywhere on the code row, we track mousemove over the
  // whole editor and toggle a class on the matching gutter element.

  let hoveredGutterEl: Element | null = null;

  function clearGutterHover() {
    if (hoveredGutterEl) {
      hoveredGutterEl.classList.remove("cm-gutter-hovered");
      hoveredGutterEl = null;
    }
  }

  const gutterHoverHandler = EditorView.domEventHandlers({
    mousemove(event, view) {
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) {
        clearGutterHover();
        return;
      }
      const gutterEls = view.dom.querySelectorAll(".cm-comment-gutter .cm-gutterElement");
      let found: Element | null = null;
      for (const el of gutterEls) {
        const rect = el.getBoundingClientRect();
        if (event.clientY >= rect.top && event.clientY < rect.bottom) {
          found = el;
          break;
        }
      }
      if (found === hoveredGutterEl) return;
      clearGutterHover();
      if (found) {
        found.classList.add("cm-gutter-hovered");
        hoveredGutterEl = found;
      }
    },
    mouseleave() {
      clearGutterHover();
    },
  });

  // Syntax highlight style that works in both light and dark mode
  const highlightStyle = HighlightStyle.define([
    { tag: tags.keyword, color: "oklch(65% 0.2 300deg)" }, // purple
    { tag: tags.controlKeyword, color: "oklch(65% 0.2 300deg)" },
    { tag: tags.function(tags.variableName), color: "oklch(70% 0.15 220deg)" }, // blue
    { tag: tags.definition(tags.variableName), color: "oklch(70% 0.15 220deg)" },
    { tag: tags.string, color: "oklch(65% 0.15 150deg)" }, // green
    { tag: tags.number, color: "oklch(70% 0.15 50deg)" }, // orange
    { tag: tags.bool, color: "oklch(70% 0.15 50deg)" },
    { tag: tags.comment, color: "var(--text-2)", fontStyle: "italic" },
    { tag: tags.lineComment, color: "var(--text-2)", fontStyle: "italic" },
    { tag: tags.blockComment, color: "var(--text-2)", fontStyle: "italic" },
    { tag: tags.operator, color: "oklch(70% 0.12 30deg)" }, // warm orange
    { tag: tags.punctuation, color: "var(--text-2)" },
    { tag: tags.heading, color: "oklch(70% 0.15 220deg)", fontWeight: "bold" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong, fontWeight: "bold" },
    { tag: tags.link, color: "oklch(65% 0.15 260deg)", textDecoration: "underline" },
    { tag: tags.typeName, color: "oklch(70% 0.15 180deg)" }, // teal
    { tag: tags.labelName, color: "oklch(70% 0.15 180deg)" },
    { tag: tags.propertyName, color: "oklch(70% 0.12 260deg)" }, // soft blue
    { tag: tags.meta, color: "var(--text-2)" },
    { tag: tags.special(tags.string), color: "oklch(65% 0.15 150deg)" },
  ]);

  const theme = EditorView.theme({
    "&": {
      height: "100%",
      fontSize: "13px",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Source Code Pro', monospace",
    },
    ".cm-gutters": {
      backgroundColor: "var(--surface-2)",
      borderRight: "1px solid var(--border)",
      color: "var(--text-2)",
    },
    ".cm-comment-gutter": {
      width: "20px",
      cursor: "pointer",
    },
    ".cm-comment-gutter .cm-gutterElement": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    // Comment marker
    ".cm-comment-marker": {
      cursor: "pointer",
      fontSize: "12px",
    },
    // Add marker — hidden by default, shown on row hover
    ".cm-add-comment": {
      opacity: "0",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      backgroundColor: "var(--accent)",
      color: "white",
      fontSize: "11px",
      fontWeight: "bold",
      lineHeight: "1",
      cursor: "pointer",
      transition: "opacity 100ms",
    },
    ".cm-comment-gutter .cm-gutterElement:hover .cm-add-comment, .cm-comment-gutter .cm-gutterElement.cm-gutter-hovered .cm-add-comment":
      {
        opacity: "1",
      },
    // Inline comment form
    ".cm-inline-comment": {
      padding: "8px 12px",
      backgroundColor: "var(--surface-2)",
      borderTop: "1px solid var(--border)",
      borderBottom: "1px solid var(--border)",
    },
    ".cm-inline-comment textarea": {
      width: "100%",
      minHeight: "60px",
      padding: "8px",
      fontSize: "13px",
      fontFamily: "inherit",
      backgroundColor: "var(--surface-1)",
      color: "var(--text-1)",
      border: "1px solid var(--border)",
      borderRadius: "4px",
      resize: "vertical",
      boxSizing: "border-box",
    },
    ".cm-inline-comment textarea:focus": {
      outline: "2px solid var(--accent)",
      outlineOffset: "-1px",
    },
    ".cm-inline-comment-actions": {
      display: "flex",
      gap: "8px",
      marginTop: "8px",
    },
    ".cm-inline-comment-submit": {
      padding: "4px 12px",
      fontSize: "13px",
      backgroundColor: "var(--accent)",
      color: "white",
      border: "none",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "500",
    },
    ".cm-inline-comment-submit:hover": {
      filter: "brightness(1.1)",
    },
    ".cm-inline-comment-cancel": {
      padding: "4px 12px",
      fontSize: "13px",
      backgroundColor: "transparent",
      color: "var(--text-2)",
      border: "1px solid var(--border)",
      borderRadius: "4px",
      cursor: "pointer",
    },
    ".cm-inline-comment-cancel:hover": {
      backgroundColor: "var(--surface-3)",
      color: "var(--text-1)",
    },
    // Pending line highlight
    ".cm-comment-pending-line": {
      backgroundColor: "oklch(70% 0.08 260deg / 12%)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--surface-3)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--surface-2)",
    },
    ".cm-content": {
      caretColor: "var(--accent)",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--accent)",
    },
    ".cm-selectionBackground": {
      backgroundColor: "oklch(60% 0.1 260deg / 25%) !important",
    },
    "&.cm-focused .cm-selectionBackground": {
      backgroundColor: "oklch(60% 0.1 260deg / 30%) !important",
    },
  });

  // Track cursor line changes from clicks only (not keyboard navigation)
  let lastCursorLine = 0;
  const cursorTracker = EditorView.updateListener.of((update) => {
    if (!update.selectionSet || !oncursorchange) return;
    // Only trigger on pointer (click) events
    const isPointer = update.transactions.some((tr) =>
      tr.annotation(Transaction.userEvent)?.startsWith("select.pointer"),
    );
    if (!isPointer) return;
    const line = update.state.doc.lineAt(update.state.selection.main.head).number;
    if (line !== lastCursorLine) {
      lastCursorLine = line;
      oncursorchange(line);
    }
  });

  function createState(doc: string) {
    return EditorState.create({
      doc,
      extensions: [
        EditorState.readOnly.of(true),
        lineNumbers(),
        highlightActiveLine(),
        highlightSpecialChars(),
        drawSelection(),
        syntaxHighlighting(highlightStyle),
        getLanguageExtension(filename),
        // State fields initialized with current prop values
        commentLinesField.init(() => commentLines),
        inlineCommentField.init((state) => makePendingDecorations(state, pendingLine)),
        // Comment gutter — always renders a marker per line (CSS handles hover visibility)
        gutter({
          class: "cm-comment-gutter",
          lineMarker(view, line) {
            const lineNo = view.state.doc.lineAt(line.from).number;
            if (view.state.field(commentLinesField).has(lineNo)) return commentMarker;
            return addMarker;
          },
          lineMarkerChange(update) {
            return (
              update.startState.field(commentLinesField) !== update.state.field(commentLinesField)
            );
          },
          domEventHandlers: {
            click(view, line) {
              const lineNo = view.state.doc.lineAt(line.from).number;
              onlinegutterclick?.(lineNo);
              return true;
            },
          },
        }),
        gutterHoverHandler,
        theme,
        EditorView.lineWrapping,
        cursorTracker,
      ],
    });
  }

  function initEditor(container: HTMLDivElement) {
    view = new EditorView({
      state: createState(content),
      parent: container,
    });
    return {
      destroy() {
        view?.destroy();
        view = undefined;
      },
    };
  }

  let prevFilename: string | undefined;
  $effect(() => {
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== content || filename !== prevFilename) {
      prevFilename = filename;
      view.setState(createState(content));
    }
  });

  // Sync commentLines prop → state field
  $effect(() => {
    if (!view) return;
    view.dispatch({ effects: setCommentLines.of(commentLines) });
  });

  // Sync pendingLine prop → inline comment widget
  $effect(() => {
    if (!view) return;
    view.dispatch({ effects: setPendingLine.of(pendingLine) });
  });
</script>

<div class="editor" use:initEditor></div>

<style>
  .editor {
    height: 100%;
    overflow: hidden;
  }

  .editor :global(.cm-editor) {
    height: 100%;
  }
</style>
