import ErrorLayout from "@/components/ErrorStates/ErrorLayout";

export default function NotFound() {
  return (
    <div className="bg-gray-950 min-h-screen pt-20">
      <ErrorLayout
        illustration="/illustrations/rocket-maintenance.png"
        title="Empty Ledger"
        message="This Market hasn't been created on the Ledger yet. It might still be in the propulsion phase or has been decommissioned."
        primaryAction={{
          label: "Return to Dashboard",
          href: "/"
        }}
      />
    </div>
  );
}
