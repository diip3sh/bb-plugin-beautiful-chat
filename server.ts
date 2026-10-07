// bb-plugin-beautiful-chat — declares the appearance settings the app overlay applies,
// and answers the changed-files list: what the latest turn edited, with line counts.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { CHIP_STYLES, COMPOSERS, LOADERS } from "./settings";
import { addChanges, type FileChange } from "./turn-changes";

export const rpcContract = defineRpcContract({
  turnChanges: {
    input: z.object({ threadId: z.string() }).strict(),
    output: z.object({
      environmentId: z.string().nullable(),
      turnId: z.string().nullable(),
      files: z.array(z.object({ path: z.string(), added: z.number(), removed: z.number() })),
    }),
  },
});

type EventRow = { seq: number; scope: { kind: string; turnId?: string }; data: unknown };
type Turn = { turnId: string | null; seq: number; files: Map<string, FileChange> };
const PAGE = 100;

export default async function plugin(bb: BbPluginApi) {
  // Per thread: its workspace, and the latest turn's changes read so far. The list
  // reads again when a run ends, so after the first read only newer events are fetched.
  const places = new Map<string, { environmentId: string; root: string } | null>();
  const turns = new Map<string, Turn>();
  const reading = new Map<string, Promise<Turn>>();

  async function placeOf(threadId: string) {
    if (!places.has(threadId)) {
      const thread = await bb.sdk.threads.get({ threadId });
      const environment = thread.environmentId ? await bb.sdk.environments.get({ environmentId: thread.environmentId }) : null;
      places.set(threadId, environment?.path ? { environmentId: environment.id, root: environment.path } : null);
    }
    return places.get(threadId) ?? null;
  }

  const events = (threadId: string, page: { afterSeq?: number; beforeSeq?: number; order: "asc" | "desc" }) =>
    bb.sdk.threads.events.list({
      threadId,
      types: ["item/completed"],
      limit: String(PAGE),
      order: page.order,
      ...(page.afterSeq !== undefined ? { afterSeq: String(page.afterSeq) } : {}),
      ...(page.beforeSeq !== undefined ? { beforeSeq: String(page.beforeSeq) } : {}),
    }) as Promise<EventRow[]>;

  const add = (turn: Turn, event: EventRow, root: string) => {
    const item = (event.data as { item?: { type?: string; status?: string; changes?: Array<{ path?: unknown; diff?: unknown }> } }).item;
    if (item?.type === "fileChange" && item.status !== "failed") addChanges(turn.files, item.changes ?? [], root);
  };

  // First read: walk back from the newest event to the start of its turn.
  async function latestTurn(threadId: string, root: string): Promise<Turn> {
    const turn: Turn = { turnId: null, seq: 0, files: new Map() };
    let beforeSeq: number | undefined;
    for (;;) {
      const page = await events(threadId, { order: "desc", beforeSeq });
      for (const event of page) {
        turn.seq = Math.max(turn.seq, event.seq);
        const turnId = event.scope.turnId;
        if (!turnId) continue;
        if (turn.turnId === null) turn.turnId = turnId;
        if (turnId !== turn.turnId) return turn;
        add(turn, event, root);
      }
      if (page.length < PAGE) return turn;
      beforeSeq = page[page.length - 1].seq;
    }
  }

  // Later reads: only newer events; a new turn starts the tally over.
  async function advance(threadId: string, turn: Turn, root: string): Promise<Turn> {
    for (;;) {
      const page = await events(threadId, { order: "asc", afterSeq: turn.seq });
      for (const event of page) {
        turn.seq = Math.max(turn.seq, event.seq);
        const turnId = event.scope.turnId;
        if (turnId && turnId !== turn.turnId) {
          turn.turnId = turnId;
          turn.files = new Map();
        }
        add(turn, event, root);
      }
      if (page.length < PAGE) return turn;
    }
  }

  bb.rpc.register(rpcContract, {
    async turnChanges({ threadId }) {
      const place = await placeOf(threadId);
      if (!place) return { environmentId: null, turnId: null, files: [] };
      // One read per thread at a time, so overlapping polls can't count an event twice.
      const previous = reading.get(threadId) ?? Promise.resolve(undefined);
      const next = previous.then(() => {
        const known = turns.get(threadId);
        return known ? advance(threadId, known, place.root) : latestTurn(threadId, place.root);
      });
      reading.set(threadId, next.catch(() => undefined) as Promise<Turn>);
      const turn = await next;
      turns.set(threadId, turn);
      return { environmentId: place.environmentId, turnId: turn.turnId, files: [...turn.files.values()] };
    },
  });

  bb.settings.define({
    loader: {
      type: "select",
      label: "Loading animation",
      description: "Icon on pending work rows. drive: pixel grid sweep; dots: round pixels; orbit: pixels circling the edge; coins: a ring of tumbling coins; bb: BB's own icon.",
      options: [...LOADERS],
      default: "drive",
    },
    shimmer: {
      type: "boolean",
      label: "Label shimmer",
      description: "BeautifulUI's brighter, faster shimmer on pending labels such as “Thinking…” and “Running”.",
      default: true,
    },
    toolChips: {
      type: "select",
      label: "Tool call rows",
      description: "surface: filled chip with a hairline; outline: hairline only; plain: no background or border.",
      options: [...CHIP_STYLES],
      default: "surface",
    },
    composer: {
      type: "select",
      label: "Composer style",
      description: "default: BB's prompt box; tray: a rounded follow-up card with the git, PR and background-command items in a tray fused onto its top.",
      options: [...COMPOSERS],
      default: "default",
    },
    workRows: {
      type: "boolean",
      label: "Compact work rows",
      description: "Pill-shaped row headers, 12.5px text, monospace durations, a guide line under expanded details, smoother expand.",
      default: true,
    },
    streamingCaret: {
      type: "boolean",
      label: "Streaming caret",
      description: "A caret at the end of the reply while a run is live.",
      default: true,
    },
    approvalCard: {
      type: "boolean",
      label: "Approval cards",
      description: "Raised cards with pill buttons for permission requests and agent questions.",
      default: true,
    },
    promptBar: {
      type: "boolean",
      label: "Prompt bar",
      description: "Raised composer, 28px controls, filled send button, background-commands card.",
      default: true,
    },
    userBubbles: {
      type: "boolean",
      label: "User message bubbles",
      description: "Soft filled bubbles for your messages.",
      default: true,
    },
    codeChips: {
      type: "boolean",
      label: "Code chips",
      description: "Hairline chips for inline code and hairline cards for code blocks.",
      default: true,
    },
    selectionPill: {
      type: "boolean",
      label: "Selection pill",
      description: "Pill style for the Add to chat / Reply in side chat popover on selected text.",
      default: true,
    },
    treeLines: {
      type: "boolean",
      label: "Tree lines",
      description: "Indent the rows of an expanded work group under its header and connect them with tree lines.",
      default: true,
    },
    minimizeWhileRunning: {
      type: "boolean",
      label: "Minimize prompt while generating",
      description: "Shrink the prompt box to one line while a response is generating; click into it to expand for a follow-up.",
      default: true,
    },
    mergedBanners: {
      type: "boolean",
      label: "Merged banner stack",
      description: "Group the cards above the composer (background commands, git, parent and child threads) into one card with hairline dividers.",
      default: true,
    },
    unreadMarker: {
      type: "boolean",
      label: "Unread marker",
      description: "Put NEW on the same line as the first unread row, in the success colour, without the rule line.",
      default: true,
    },
    messageActions: {
      type: "boolean",
      label: "Message actions",
      description: "Spatial tooltips that glide along rows of 3+ icon buttons, plus hover chips.",
      default: true,
    },
    turnChanges: {
      type: "boolean",
      label: "Changed files list",
      description: "Under the latest response, the files its turn edited with line counts: three at first, the rest on expand. Click one to open it.",
      default: true,
    },
  });
  bb.log.info("loaded");
}
