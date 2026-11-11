import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AccountPublicProfile } from "../../relay/accountTypes";
import type {
  UserDemoUpload,
  UserDemoUploadList,
} from "../../relay/userDemoTypes";
import type { AppAccountState } from "../state/appAccountStore";
import type { DemoIndexEntry } from "../stream/demoIndex";
import UserDemos from "./UserDemos";

const OWNER = "123456789012345678";
const OTHER = "223456789012345678";
const key = (user = OWNER, hash = "a") =>
  `users/${user}/server_20260901T2000_katabatic_${hash.repeat(6)}.rec`;
const fixture = vi.hoisted(() => ({
  demos: undefined as DemoIndexEntry[] | undefined,
  index: { isPending: false, isFetching: false, isError: false },
  account: {} as AppAccountState,
  uploads: undefined as UserDemoUploadList | undefined,
  uploadsError: false,
  profile: undefined as AccountPublicProfile | null | undefined,
  profileError: false,
  profileOptions: {} as {
    queryKey: readonly string[];
    enabled: boolean;
    staleTime: number;
    refetchOnWindowFocus: boolean;
    queryFn: (context: { signal: AbortSignal }) => Promise<unknown>;
  },
  queryOptions: {} as {
    queryKey: readonly string[];
    enabled: boolean;
    refetchOnWindowFocus: boolean;
    refetchInterval: (query: {
      state: { data?: UserDemoUploadList };
    }) => number | false;
    queryFn: (context: { signal: AbortSignal }) => Promise<UserDemoUploadList>;
  },
  invalidate: vi.fn(),
  cacheUpload: vi.fn(),
  refreshAccount: vi.fn(),
  deletes: new Map<string, () => void>(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: fixture.invalidate,
    setQueryData: fixture.cacheUpload,
  }),
  useQuery: (
    options: typeof fixture.queryOptions | typeof fixture.profileOptions,
  ) => {
    if (options.queryKey[0] === "userProfile") {
      fixture.profileOptions = options as typeof fixture.profileOptions;
      return {
        data: fixture.profile,
        isError: fixture.profileError,
        isFetching: false,
      };
    }
    fixture.queryOptions = options as typeof fixture.queryOptions;
    return {
      data: fixture.uploads,
      isError: fixture.uploadsError,
      isFetching: false,
    };
  },
}));
vi.mock("./useDemoIndex", () => ({
  useDemoIndex: () => ({ data: fixture.demos, ...fixture.index }),
  refreshDemoIndex: vi.fn(),
}));
vi.mock("../state/appAccountStore", () => ({
  useAppAccount: (select: (state: AppAccountState) => unknown) =>
    select(fixture.account),
  refreshAccount: fixture.refreshAccount,
}));
vi.mock("../account/authClient", () => ({
  appApiBaseUrl: "https://api.example.com",
}));
vi.mock("./DemoCard", () => ({
  DemoCard: ({
    demo,
    onDelete,
    deleting,
  }: {
    demo: DemoIndexEntry;
    onDelete?: () => void;
    deleting?: boolean;
  }) => {
    if (onDelete) fixture.deletes.set(demo.filename, onDelete);
    return (
      <article data-demo={demo.filename}>
        {demo.games[0]?.mission}
        {onDelete && (
          <button disabled={deleting} aria-label={`Delete ${demo.filename}`}>
            Delete
          </button>
        )}
      </article>
    );
  },
  PendingDemoCard: ({
    filename,
    status,
    progress,
    error,
    onDelete,
  }: {
    filename: string;
    status: string;
    progress?: number | null;
    error?: boolean;
    onDelete?: () => void;
  }) => {
    if (onDelete) fixture.deletes.set(filename, onDelete);
    return (
      <article data-pending={filename} role={error ? "alert" : "status"}>
        {filename}: {status}
        {progress != null && <progress max={1} value={progress} />}
        {onDelete && <button aria-label={`Delete ${filename}`}>Delete</button>}
      </article>
    );
  },
}));

const demo: DemoIndexEntry = {
  filename: key(),
  bytes: 100,
  recordedAt: "2026-11-01T12:00:00.000Z",
  server: "Example server",
  address: "example:28000",
  games: [
    { mission: "SoloGame", gameType: "CTF", startMs: 0, tournament: false },
  ],
  mod: "Classic",
  recorder: "Example recorder",
  durationMs: 32,
  players: ["One player"],
  playerCount: 1,
};

function ledger(state: "ready" | "deleting" = "ready"): UserDemoUploadList {
  return {
    demos: [
      {
        id: "12345678-1234-4123-8123-123456789abc",
        originalFilename: "game.rec",
        filename: key(),
        state,
        bytes: 100,
        storedBytes: 200,
        recordedAt: demo.recordedAt,
        createdAt: "2026-11-08T12:00:00.000Z",
        error: null,
      },
    ],
    usage: { bytes: 200, count: 1 },
    limits: {
      maxDemoBytes: 50_000_000,
      maxExpandedBytes: 128_000_000,
      maxStorageBytes: 8_000_000_000,
      maxDemos: 1_000,
    },
  };
}

/** Add a second ledger row alongside the ready upload of `demo`. */
function withUpload(
  list: UserDemoUploadList,
  changes: Partial<UserDemoUpload>,
): UserDemoUploadList {
  list.demos.push({
    ...list.demos[0],
    id: "22345678-1234-4123-8123-123456789abc",
    originalFilename: "new.rec",
    ...changes,
  });
  return list;
}

function signIn(userId = OWNER, role: "user" | "admin" = "user") {
  fixture.account.user = {
    id: "account",
    discordId: userId,
    discordUsername: "example",
    name: "Example",
    image: null,
    role,
  };
}

beforeEach(() => {
  fixture.demos = [demo];
  fixture.index = { isPending: false, isFetching: false, isError: false };
  fixture.account = {
    status: "ready",
    user: null,
    enabled: true,
    pending: null,
    error: null,
    signInUrl: null,
  };
  fixture.uploads = undefined;
  fixture.uploadsError = false;
  fixture.profile = undefined;
  fixture.profileError = false;
  fixture.invalidate.mockClear();
  fixture.refreshAccount.mockClear();
  fixture.cacheUpload.mockReset();
  fixture.cacheUpload.mockImplementation(
    (
      _key: readonly string[],
      update: (
        previous: UserDemoUploadList | undefined,
      ) => UserDemoUploadList | undefined,
    ) => {
      fixture.uploads = update(fixture.uploads);
      return fixture.uploads;
    },
  );
  fixture.deletes.clear();
});

afterEach(() => vi.unstubAllGlobals());

const render = (userId = OWNER) =>
  renderToStaticMarkup(<UserDemos userId={userId} />);

it("shows public cards for only the exact canonical owner, including short solo demos", () => {
  fixture.demos = [
    demo,
    {
      ...demo,
      filename: key(OTHER, "b"),
      games: [{ ...demo.games[0], mission: "OtherOwner" }],
    },
    {
      ...demo,
      filename: "recording.rec",
      games: [{ ...demo.games[0], mission: "MapGeniusDemo" }],
    },
    {
      ...demo,
      filename: `users/${OWNER}0/community.rec`,
      games: [{ ...demo.games[0], mission: "SimilarOwner" }],
    },
  ];
  const markup = render();
  expect(markup).toContain("SoloGame");
  expect(markup).not.toContain("OtherOwner");
  expect(markup).not.toContain("MapGeniusDemo");
  expect(markup).not.toContain("SimilarOwner");
  expect(markup).not.toContain("Delete");
  expect(fixture.queryOptions.enabled).toBe(false);
});

it.each([
  { viewer: "owner", name: `${"a".repeat(64)}.rec` },
  { viewer: "visitor", name: `${"a".repeat(64)}.rec` },
  { viewer: "owner", name: "another-naming-scheme.rec" },
  { viewer: "visitor", name: "another-naming-scheme.rec" },
])(
  "shows the published $name to the $viewer independently of upload naming",
  ({ viewer, name }) => {
    const filename = `users/${OWNER}/${name}`;
    fixture.demos = [{ ...demo, filename }];
    if (viewer === "owner") {
      signIn();
      fixture.uploads = ledger();
      fixture.uploads.demos[0].filename = filename;
    }
    const markup = render();
    expect(markup).toContain(`data-demo="${filename}"`);
    expect(markup).not.toContain("Loading demo data");
    expect(markup).not.toContain("data-pending");
    if (viewer === "owner")
      expect(markup).toContain(`aria-label="Delete ${filename}"`);
  },
);

it("renders every matching card without pagination, search, upload, or drop controls", () => {
  fixture.demos = Array.from({ length: 12 }, (_, i) => ({
    ...demo,
    filename: key(OWNER, i.toString(16)),
  }));
  const markup = render();
  expect(markup.match(/<article\b/g)).toHaveLength(12);
  expect(markup).not.toMatch(
    /Previous page|Next page|Search|My demos|Upload demo|Drag|<input/,
  );
});

it("sorts by recording date rather than upload creation time without mutating the shared index", () => {
  const newer = {
    ...demo,
    filename: key(OWNER, "b"),
    recordedAt: "2026-11-07T12:00:00.000Z",
  };
  fixture.demos = [demo, newer];
  const markup = render();
  expect(markup.indexOf(newer.filename)).toBeLessThan(
    markup.indexOf(demo.filename),
  );
  expect(fixture.demos[0]).toBe(demo);
});

it("offers delete controls only for a verified owner's ready ledger rows", () => {
  signIn();
  fixture.uploads = withUpload(ledger(), {
    filename: key(OWNER, "b"),
    state: "publishing",
  });
  fixture.demos = [demo, { ...demo, filename: key(OWNER, "b") }];
  const markup = render();
  expect(markup.match(/<article\b/g)).toHaveLength(2);
  expect(markup.match(/aria-label="Delete /g)).toHaveLength(1);
  expect(markup).toContain(`aria-label="Delete ${demo.filename}"`);
  expect(fixture.queryOptions.enabled).toBe(true);
  expect(fixture.queryOptions.refetchOnWindowFocus).toBe(false);
});

it("shows the owner only ledger-backed cards, so a deleted demo's stale index entry stays hidden", () => {
  signIn();
  fixture.uploads = { ...ledger(), demos: [] };
  const markup = render();
  expect(markup).not.toContain("SoloGame");
  expect(markup).toContain("No demos uploaded yet.");
});

it.each(["user", "admin"] as const)(
  "does not offer another owner deletion rights to a %s",
  (role) => {
    signIn(OTHER, role);
    fixture.uploads = ledger();
    expect(render()).not.toContain("Delete");
    expect(fixture.queryOptions.enabled).toBe(false);
  },
);

it("hides owner controls if the current session could not be verified", () => {
  signIn();
  fixture.account.status = "error";
  fixture.uploads = ledger();
  expect(render()).not.toContain("Delete");
  expect(fixture.queryOptions.enabled).toBe(false);
});

it("hides deleting cards from a stale index and polls until durable cleanup completes", () => {
  signIn();
  fixture.uploads = ledger("deleting");
  const markup = render();
  expect(markup).not.toContain("SoloGame");
  expect(markup).toContain("Finishing demo deletion…");
  expect(markup).not.toContain("data-pending");
  expect(
    fixture.queryOptions.refetchInterval({ state: { data: fixture.uploads } }),
  ).toBe(3_000);
  expect(
    fixture.queryOptions.refetchInterval({ state: { data: ledger() } }),
  ).toBe(false);
});

it("caches an accepted deletion before refetching so stale ledger data cannot reenable uploads", async () => {
  signIn();
  fixture.uploads = ledger();
  const deleted = { ...fixture.uploads.demos[0], state: "deleting" };
  const request = vi.fn(async (_url: URL, _options?: RequestInit) =>
    Response.json({ demo: deleted }, { status: 202 }),
  );
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("window", { confirm: vi.fn(() => true) });
  render();
  fixture.deletes.get(demo.filename)!();
  await vi.waitFor(() => expect(fixture.cacheUpload).toHaveBeenCalledOnce());
  expect(fixture.uploads!.demos).toEqual([deleted]);
  const markup = render();
  expect(markup).not.toContain("SoloGame");
  expect(markup).toContain("Finishing demo deletion…");
  expect(
    markup.match(/<button\b[^>]*aria-label="Upload demo \(\.rec\)"[^>]*>/)?.[0],
  ).toContain('disabled=""');
  expect(request).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({ method: "DELETE", credentials: "include" }),
  );
  expect(request.mock.calls[0][0].searchParams.get("owner")).toBe(OWNER);
});

it("binds delayed private ledger requests to the viewed account and refreshes a changed session", async () => {
  signIn();
  fixture.uploads = ledger();
  const request = vi.fn(async (_url: URL, _options?: RequestInit) =>
    Response.json(
      { error: "Your signed-in account changed. Please try again." },
      { status: 401 },
    ),
  );
  vi.stubGlobal("fetch", request);
  render();
  const load = fixture.queryOptions.queryFn;
  signIn(OTHER);
  await expect(load({ signal: new AbortController().signal })).rejects.toThrow(
    "Your signed-in account changed",
  );
  expect(request.mock.calls[0][0].searchParams.get("owner")).toBe(OWNER);
  expect(fixture.refreshAccount).toHaveBeenCalledOnce();
});

it("keeps a delete callback bound to its original owner when the session changes", async () => {
  signIn();
  fixture.uploads = ledger();
  const request = vi.fn(async (_url: URL, _options?: RequestInit) =>
    Response.json(
      { error: "Your signed-in account changed. Please try again." },
      { status: 401 },
    ),
  );
  vi.stubGlobal("fetch", request);
  vi.stubGlobal("window", { confirm: () => true });
  render();
  const remove = fixture.deletes.get(demo.filename)!;
  signIn(OTHER);
  remove();
  await vi.waitFor(() => expect(fixture.refreshAccount).toHaveBeenCalledOnce());
  const url = request.mock.calls[0][0];
  expect(url.searchParams.get("owner")).toBe(OWNER);
  expect(url.pathname).toBe(
    `/api/demo-uploads/${fixture.uploads!.demos[0].id}`,
  );
  expect(fixture.cacheUpload).not.toHaveBeenCalled();
  expect(fixture.uploads!.demos[0].state).toBe("ready");
});

it("keeps public cards available when the private owner controls fail", () => {
  signIn();
  fixture.uploadsError = true;
  const markup = render();
  expect(markup).toContain("SoloGame");
  expect(markup).toContain("Could not load your demo controls");
  expect(markup).not.toContain('aria-label="Delete ');
});

it.each([
  "",
  "not-an-id",
  "123",
  "123456789012345678901",
  `${OWNER}/../${OTHER}`,
])("rejects an invalid user ID without listing other demos (%s)", (userId) => {
  const markup = render(userId);
  expect(markup).toContain("Invalid Discord user ID");
  expect(markup).not.toContain("SoloGame");
  expect(fixture.queryOptions.enabled).toBe(false);
});

it("shows the empty state without falling back to featured demos", () => {
  fixture.demos = [{ ...demo, filename: key(OTHER) }];
  const markup = render();
  expect(markup).toContain("No demos uploaded yet.");
  expect(markup).not.toContain("SoloGame");
});

it("shows an index loading state", () => {
  fixture.demos = undefined;
  fixture.index.isPending = true;
  expect(render()).toContain("Loading demos…");
});

it("shows a clear index error rather than claiming that the user has no demos", () => {
  fixture.demos = undefined;
  fixture.index.isError = true;
  const markup = render();
  expect(markup).toContain("Could not load demos");
  expect(markup).not.toContain("No demos uploaded yet.");
});

it("offers the public-upload drop surface only on the verified owner's page", () => {
  signIn();
  fixture.uploads = ledger();
  const markup = render();
  expect(markup).toContain('aria-label="Upload demo (.rec)"');
  expect(markup).toContain("Upload a demo");
  expect(markup).toContain(
    "It will be made public and appear in the demo browser.",
  );
  expect(markup).toContain("Drop a .rec file here");
  expect(markup).not.toMatch(/50 MB|\d+ \/ \d+ demos|8\.00 GB/);
  expect(markup).not.toContain('aria-label="Load demo (.rec)"');
  const input = markup.match(/<input\b[^>]*>/)?.[0];
  expect(input).toContain('accept=".rec"');
  expect(input).not.toContain("multiple");
  signIn(OTHER);
  const publicPage = render();
  expect(publicPage).not.toContain("Upload demo");
  expect(publicPage).not.toContain("<input");
});

it.each([
  "receiving",
  "queued",
  "processing",
  "publishing",
  "deleting",
] as const)(
  "shows %s work and polls while disabling another upload",
  (state) => {
    signIn();
    fixture.uploads = ledger();
    fixture.uploads.demos[0].state = state;
    fixture.demos = [];
    const markup = render();
    const button = markup.match(
      /<button\b[^>]*aria-label="Upload demo \(\.rec\)"[^>]*>/,
    )?.[0];
    expect(button).toContain('disabled=""');
    if (state === "deleting") {
      expect(markup).not.toContain("data-pending");
      expect(markup).not.toContain("Deleting: game.rec");
    } else {
      const label =
        state === "receiving"
          ? "Uploading"
          : state[0].toUpperCase() + state.slice(1);
      expect(markup).toContain(`data-pending="game.rec"`);
      expect(markup).toContain(`game.rec: ${label}`);
      const feedback = markup.match(
        /class="[^"]*UploadFeedback[^>]*>([\s\S]*)$/,
      )?.[1];
      expect(feedback).not.toContain(label);
    }
    expect(
      fixture.queryOptions.refetchInterval({
        state: { data: fixture.uploads },
      }),
    ).toBe(3_000);
  },
);

it("shows a processing failure and permits another upload", () => {
  signIn();
  fixture.uploads = ledger();
  fixture.uploads.demos[0].state = "failed";
  fixture.uploads.demos[0].filename = null;
  fixture.uploads.demos[0].error = "The recording is corrupt.";
  const markup = render();
  expect(markup).toContain("The recording is corrupt.");
  expect(markup).toContain('role="alert"');
  const button = markup.match(
    /<button\b[^>]*aria-label="Upload demo \(\.rec\)"[^>]*>/,
  )?.[0];
  expect(button).not.toContain("disabled");
  expect(
    fixture.queryOptions.refetchInterval({ state: { data: fixture.uploads } }),
  ).toBe(false);
});

it.each(["loading", "failed", "signing out"])(
  "disables uploading while availability is %s",
  (reason) => {
    signIn();
    fixture.uploads = ledger();
    if (reason === "loading") fixture.uploads = undefined;
    if (reason === "failed") fixture.uploadsError = true;
    if (reason === "signing out") fixture.account.pending = "sign-out";
    const button = render().match(
      /<button\b[^>]*aria-label="Upload demo \(\.rec\)"[^>]*>/,
    )?.[0];
    expect(button).toContain('disabled=""');
  },
);

it.each(["count", "storage"])(
  "leaves the picker usable at the %s limit so an upload attempt can explain it",
  (limit) => {
    signIn();
    fixture.uploads = ledger();
    if (limit === "count")
      fixture.uploads.usage.count = fixture.uploads.limits.maxDemos;
    else fixture.uploads.usage.bytes = 8_000_000_000;
    const markup = render();
    const button = markup.match(
      /<button\b[^>]*aria-label="Upload demo \(\.rec\)"[^>]*>/,
    )?.[0];
    expect(button).not.toContain("disabled");
    expect(markup).not.toMatch(/50 MB|\d+ demos|8\.00 GB|upload limit/);
  },
);

it.each(["queued", "processing", "publishing", "ready"] as const)(
  "does not duplicate a published card while the cached ledger still says %s",
  (state) => {
    signIn();
    fixture.uploads = ledger();
    fixture.uploads.demos[0].state = state;
    const markup = render();
    expect(markup).toContain(`data-demo="${demo.filename}"`);
    expect(markup).not.toContain("data-pending");
    expect(markup.match(/<article\b/g)).toHaveLength(1);
  },
);

it.each(["loading", "failed"])(
  "keeps a processing card visible while the index is %s",
  (state) => {
    signIn();
    fixture.uploads = ledger();
    fixture.uploads.demos[0].state = "processing";
    fixture.demos = undefined;
    fixture.index.isPending = state === "loading";
    fixture.index.isError = state === "failed";
    const markup = render();
    expect(markup).toContain('data-pending="game.rec"');
    expect(markup).toContain("game.rec: Processing");
    expect(markup).not.toContain("No demos uploaded yet.");
  },
);

it("keeps a ready upload represented and deletable while its public index entry is missing", () => {
  signIn();
  fixture.uploads = ledger();
  fixture.demos = [];
  const markup = render();
  expect(markup).toContain('data-pending="game.rec"');
  expect(markup).toContain("Demo data is unavailable");
  expect(markup).toContain('data-pending="game.rec" role="alert"');
  expect(markup).not.toContain("Loading demo data…");
  expect(markup).toContain('aria-label="Delete game.rec"');
  expect(markup).not.toContain("No demos uploaded yet.");
});

it("shows an error card when a ready upload cannot load its public metadata", () => {
  signIn();
  fixture.uploads = ledger();
  fixture.demos = [];
  fixture.index.isError = true;
  const markup = render();
  expect(markup).toContain('data-pending="game.rec" role="alert"');
  expect(markup).toContain("Demo data is unavailable");
});

it("shows ready metadata as loading only while the index is refreshing", () => {
  signIn();
  fixture.uploads = ledger();
  fixture.demos = [];
  fixture.index.isFetching = true;
  const markup = render();
  expect(markup).toContain("Loading demo data…");
  expect(markup).toContain('data-pending="game.rec" role="status"');
  expect(markup).not.toContain("Demo data is unavailable");
});

it.each(["loading", "failed"])(
  "does not invent historical ready placeholders before the initial index is known (%s)",
  (state) => {
    signIn();
    fixture.uploads = ledger();
    fixture.demos = undefined;
    fixture.index.isPending = state === "loading";
    fixture.index.isError = state === "failed";
    const markup = render();
    expect(markup).not.toContain("data-pending");
    expect(markup).toContain(
      state === "loading" ? "Loading demos…" : "Could not load demos",
    );
  },
);

it("places uploads with an unknown recording date before published cards", () => {
  signIn();
  fixture.uploads = withUpload(ledger(), {
    filename: null,
    state: "processing",
    recordedAt: null,
  });
  const markup = render();
  expect(markup.indexOf('data-pending="new.rec"')).toBeLessThan(
    markup.indexOf(`data-demo="${demo.filename}"`),
  );
});

it("uses the known recording date to position transitional cards", () => {
  signIn();
  fixture.uploads = withUpload(ledger(), {
    filename: key(OWNER, "b"),
    state: "publishing",
    recordedAt: "2026-10-01T12:00:00.000Z",
  });
  const markup = render();
  expect(markup.indexOf(`data-demo="${demo.filename}"`)).toBeLessThan(
    markup.indexOf('data-pending="new.rec"'),
  );
});

it.each(["queued", "processing", "publishing", "failed"] as const)(
  "does not reveal another user's private %s upload state",
  (state) => {
    signIn(OTHER);
    fixture.uploads = ledger();
    fixture.uploads.demos[0].state = state;
    const markup = render();
    expect(markup).not.toContain("data-pending");
    expect(markup).not.toContain("game.rec");
    expect(markup).toContain("SoloGame");
  },
);

it("shows the public Discord identity above Uploaded demos", () => {
  fixture.profile = {
    discordId: OWNER,
    name: "Public <Player>",
    discordUsername: "public_player",
    image: "https://cdn.discordapp.com/avatar.png",
  };
  const markup = render();
  expect(markup).toContain("Public &lt;Player&gt;");
  expect(markup).toContain(">public_player</span>");
  expect(markup).not.toContain("@public_player");
  expect(markup).toContain('width="64" height="64"');
  expect(markup).toMatch(/<h1\b[^>]*>Public &lt;Player&gt;<\/h1>/);
  expect(markup).toContain('aria-label="Discord"');
  const badge = markup.match(/<a\b[^>]*>[\s\S]*?<\/a>/)?.[0];
  expect(badge).toContain(`href="https://discord.com/users/${OWNER}"`);
  expect(badge).toContain('target="_blank"');
  expect(badge).toContain('rel="noopener noreferrer"');
  expect(badge).toContain('aria-label="Discord"');
  expect(badge).toContain(">public_player</span>");
  expect(markup.indexOf("Public &lt;Player&gt;")).toBeLessThan(
    markup.indexOf(">Uploaded demos<"),
  );
  expect(markup).not.toContain("Sign out");
  expect(markup).not.toContain('aria-label="Admin"');
  expect(fixture.profileOptions.queryKey).toEqual(["userProfile", OWNER]);
  expect(fixture.profileOptions.enabled).toBe(true);
  expect(fixture.profileOptions.staleTime).toBe(60_000);
  expect(fixture.profileOptions.refetchOnWindowFocus).toBe(false);
});

it("shows the current signed-in identity immediately without a public profile request", () => {
  signIn();
  fixture.profile = {
    discordId: OWNER,
    name: "Old public name",
    discordUsername: "old_handle",
    image: null,
  };
  const markup = render();
  expect(markup).toContain("Example");
  expect(markup).toContain(">example</span>");
  expect(markup).toContain(`href="https://discord.com/users/${OWNER}"`);
  expect(markup).not.toContain("@example");
  expect(markup).not.toContain("Old public name");
  expect(markup).not.toContain("@old_handle");
  expect(fixture.profileOptions.enabled).toBe(false);
});

it.each(["unknown", "unavailable"])(
  "keeps demos visible when the public profile is %s",
  (state) => {
    fixture.profile = state === "unknown" ? null : undefined;
    fixture.profileError = state === "unavailable";
    const markup = render();
    expect(markup).toContain(
      state === "unknown" ? "Unknown user" : "Profile unavailable",
    );
    expect(markup).toContain("SoloGame");
    expect(markup).toContain("Uploaded demos");
  },
);

it("does not request a profile for an invalid Discord ID", () => {
  render("../invalid");
  expect(fixture.profileOptions.enabled).toBe(false);
});

it("fetches public profile data without cookies and preserves query cancellation", async () => {
  const profile = {
    discordId: OWNER,
    name: "Public Player",
    discordUsername: "public_player",
    image: null,
  };
  const fetchProfile = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(profile), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchProfile);
  render();
  const controller = new AbortController();
  await expect(
    fixture.profileOptions.queryFn({ signal: controller.signal }),
  ).resolves.toEqual(profile);
  expect(String(fetchProfile.mock.calls[0][0])).toBe(
    `https://api.example.com/api/users/${OWNER}`,
  );
  const options = fetchProfile.mock.calls[0][1];
  expect(options).toEqual(
    expect.objectContaining({
      credentials: "omit",
      cache: "no-cache",
      signal: expect.any(AbortSignal),
    }),
  );
  expect(options?.signal?.aborted).toBe(false);
  controller.abort();
  expect(options?.signal?.aborted).toBe(true);
});

it("treats an unknown public account as a missing profile", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("Not found", { status: 404 })),
  );
  render();
  await expect(
    fixture.profileOptions.queryFn({ signal: new AbortController().signal }),
  ).resolves.toBeNull();
});

it("does not expose server error details when profile loading fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response("Internal private diagnostics", { status: 500 }),
    ),
  );
  render();
  await expect(
    fixture.profileOptions.queryFn({ signal: new AbortController().signal }),
  ).rejects.toThrow("Could not load user profile");
});
