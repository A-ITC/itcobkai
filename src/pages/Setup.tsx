import { useNavigate } from "@solidjs/router";
import ProfileForm from "../main/ProfileForm";

export default function Setup() {
  const navigate = useNavigate();

  return (
    <div class="text-gray-200">
      <div class="mx-auto my-12 max-w-sm border-2 border-gray-900 bg-gray-800 px-4 pb-8 text-center">
        <h1 class="py-4 text-center text-2xl font-bold">ITCOBKAI</h1>
        <ProfileForm onSaved={() => navigate("/", { replace: true })} />
      </div>
    </div>
  );
}
