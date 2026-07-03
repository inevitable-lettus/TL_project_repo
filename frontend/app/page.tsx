import { Window } from "@/components/ui";

// Placeholder landing. Phase 5 replaces this with the slider + featured grid.
export default function Home() {
  return (
    <div className="mx-auto max-w-2xl pt-8">
      <Window title="WELCOME.TXT" floating>
        <h1 className="mb-3">Tinkerer Lab</h1>
        <p className="max-w-[70ch] text-lg leading-[1.65]">
          Projects from the university makerspace. Landing page under
          construction.
        </p>
      </Window>
    </div>
  );
}
