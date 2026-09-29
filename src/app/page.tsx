import { RiotIdForm } from "./riot-id-form";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">hylistats</h1>
      <RiotIdForm />
    </main>
  );
}
