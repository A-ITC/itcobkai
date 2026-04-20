export type Tab = "map" | "edit";

export function HeaderBar(props: { tab: Tab; onTabChange: (tab: Tab) => void }) {
  return (
    <div class="flex items-center justify-between mb-4 w-full">
      <div class="flex items-center gap-3">
        <div class="text-2xl portrait:text-4xl font-bold text-white tracking-tight">ITCOBKAI</div>
        <div class="flex rounded overflow-hidden border border-gray-600 text-sm portrait:text-base">
          <button
            class={`px-2 portrait:px-3 transition-colors ${
              props.tab === "map" ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-300 hover:bg-gray-700"
            }`}
            onClick={() => props.onTabChange("map")}
          >
            MAP
          </button>
          <button
            class={`px-2 portrait:px-3 transition-colors ${
              props.tab === "edit" ? "bg-gray-700 text-white" : "bg-gray-900 text-gray-300 hover:bg-gray-700"
            }`}
            onClick={() => props.onTabChange("edit")}
          >
            EDIT
          </button>
        </div>
      </div>
    </div>
  );
}
