import { createSignal, onMount, For } from "solid-js";
import { User } from "../common/Schema";
import request from "../common/Common";

type Group = "dtm" | "cg" | "prog" | "mv" | "3dcg";

const GROUP_OPTIONS: { value: Group; label: string }[] = [
  { value: "dtm", label: "DTM" },
  { value: "cg", label: "CG" },
  { value: "prog", label: "PROG" },
  { value: "mv", label: "MV" },
  { value: "3dcg", label: "3DCG" }
];

type Props = {
  /** 提供された場合は /users/@me の GET を省略しネットワーク負荷を軽減する */
  initialUser?: User;
  onSaved?: () => void;
};

export default function ProfileForm(props: Props) {
  const [name, setName] = createSignal("");
  const [year, setYear] = createSignal(1);
  const [groups, setGroups] = createSignal<Group[]>([]);
  const [greeting, setGreeting] = createSignal("");
  const [loading, setLoading] = createSignal(true);
  const [submitting, setSubmitting] = createSignal(false);

  onMount(async () => {
    let user: User | undefined = props.initialUser;
    if (!user) {
      // 401 の場合 request() が自動でログインページにリダイレクトする
      user = await request("GET", "/users/@me");
      if (!user) return;
    }

    if (user.name) setName(user.name);
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
      await request("POST", "/users/@me", {
        name: name(),
        year: year(),
        groups: groups(),
        greeting: greeting()
      });
      props.onSaved?.();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div class="mx-auto max-w-sm px-4 pb-8 text-center">
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
  );
}
