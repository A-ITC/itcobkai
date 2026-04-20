import { useNavigate } from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import { User } from "../common/Schema";
import ProfileForm from "../views/ProfileForm";

export default function Setup() {
  const navigate = useNavigate();
  const [user, setUser] = createSignal<User | null>(null);

  onMount(async () => {
    const tokenRes = await fetch("/api/token", { credentials: "include" });
    if (!tokenRes.ok) {
      navigate("/login", { replace: true });
      return;
    }
    const { token } = await tokenRes.json();

    const meRes = await fetch("/api/users/@me", {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!meRes.ok) {
      navigate("/login", { replace: true });
      return;
    }

    const me = (await meRes.json()) as User;
    if (me.name) {
      navigate("/", { replace: true });
      return;
    }
    setUser(me);
  });

  return (
    <div class="text-gray-200">
      <div class="mx-auto my-12 max-w-sm border-2 border-gray-900 bg-gray-800 px-4 pb-8 text-center">
        <h1 class="py-4 text-center text-2xl font-bold">ITCOBKAI</h1>
        <Show when={user()}>
          {u => (
            <ProfileForm
              initialUser={u()}
              onSaved={() => navigate("/", { replace: true })}
            />
          )}
        </Show>
      </div>
    </div>
  );
}
