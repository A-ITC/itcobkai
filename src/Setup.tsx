import { createSignal, onMount, For } from "solid-js";
import { useNavigate } from "@solidjs/router";

type Group = "dtm" | "cg" | "prog" | "mv" | "3dcg";

const GROUP_OPTIONS: { value: Group; label: string }[] = [
  { value: "dtm", label: "DTM" },
  { value: "cg", label: "CG" },
  { value: "prog", label: "PROG" },
  { value: "mv", label: "MV" },
  { value: "3dcg", label: "3DCG" }
];

export default function Setup() {
  const navigate = useNavigate();

  const [token, setToken] = createSignal("");
  const [name, setName] = createSignal("");
  const [year, setYear] = createSignal(1);
  const [groups, setGroups] = createSignal<Group[]>([]);
  const [greeting, setGreeting] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [submitting, setSubmitting] = createSignal(false);

  onMount(async () => {
    const tokenRes = await fetch("/api/token");
    if (tokenRes.status === 401) {
      navigate("/login", { replace: true });
      return;
    }
    const tokenData = await tokenRes.json();
    const jwt = tokenData.token as string;
    setToken(jwt);

    const meRes = await fetch("/api/users/@me", {
      headers: { Authorization: `Bearer ${jwt}` }
    });
    if (!meRes.ok) {
      navigate("/login", { replace: true });
      return;
    }
    const user = await meRes.json();
    if (user.name) {
      navigate("/", { replace: true });
      return;
    }

    // 既存データでフォームを初期化（再編集に備えて）
    if (user.year > 0) setYear(user.year);
    if (Array.isArray(user.groups)) setGroups(user.groups as Group[]);
    if (user.greeting) setGreeting(user.greeting);
    setLoading(false);
  });

  function toggleGroup(g: Group) {
    setGroups(prev => (prev.includes(g) ? prev.filter(v => v !== g) : [...prev, g]));
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/users/@me", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token()}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: name(),
          year: year(),
          groups: groups(),
          greeting: greeting()
        })
      });
      if (res.ok) {
        navigate("/", { replace: true });
      } else {
        const json = await res.json();
        window.alert(json.detail || "エラーが発生しました");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div class="text-gray-200">
      <div class="mx-auto my-12 max-w-sm border-2 border-gray-900 bg-gray-800 px-4 pb-8 text-center">
        <h1 class="py-4 text-center text-2xl font-bold">ITCOBKAI</h1>
        <h2 class="py-4 text-center text-xl font-bold">プロフィール設定</h2>

        {loading() ? (
          <div class="py-8">読み込み中...</div>
        ) : (
          <form
            onSubmit={onSubmit}
            class="flex flex-col gap-4 text-left"
          >
            {/* 名前 */}
            <label class="flex flex-col gap-1">
              <span class="font-bold">名前</span>
              <input
                type="text"
                required
                maxlength="40"
                value={name()}
                onInput={e => setName(e.currentTarget.value)}
                class="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-gray-100 focus:outline-none"
                placeholder="表示名を入力"
              />
              <span class="text-right text-xs text-gray-400">{name().length} / 40</span>
            </label>

            {/* 何期生 */}
            <label class="flex flex-col gap-1">
              <span class="font-bold">何期生</span>
              <select
                value={year()}
                onChange={e => setYear(Number(e.currentTarget.value))}
                class="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-gray-100 focus:outline-none"
              >
                <For each={Array.from({ length: 20 }, (_, i) => i + 1)}>{n => <option value={n}>{n}期生</option>}</For>
              </select>
            </label>

            {/* 所属 */}
            <div class="flex flex-col gap-1">
              <span class="font-bold">所属（複数選択可）</span>
              <div class="flex flex-wrap gap-2">
                <For each={GROUP_OPTIONS}>
                  {opt => (
                    <label class="flex cursor-pointer items-center gap-1 rounded border border-gray-600 px-2 py-1 hover:bg-gray-700">
                      <input
                        type="checkbox"
                        checked={groups().includes(opt.value)}
                        onChange={() => toggleGroup(opt.value)}
                        class="accent-blue-400"
                      />
                      {opt.label}
                    </label>
                  )}
                </For>
              </div>
            </div>

            {/* 挨拶 */}
            <label class="flex flex-col gap-1">
              <span class="font-bold">挨拶</span>
              <textarea
                maxlength="400"
                value={greeting()}
                onInput={e => setGreeting(e.currentTarget.value)}
                rows={4}
                class="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-gray-100 focus:outline-none"
                placeholder="一言自己紹介など（省略可）"
              />
              <span class="text-right text-xs text-gray-400">{greeting().length} / 400</span>
            </label>

            <button
              type="submit"
              disabled={submitting()}
              class="mt-2 rounded bg-blue-600 py-2 font-bold text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {submitting() ? "送信中..." : "登録する"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
