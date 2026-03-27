"use client";
/**
 * QuorumTracker
 *
 * Displays a progress bar showing how many council votes have been cast
 * vs. the quorum threshold required for finality.
 */

interface Props {
  votesYes: number;
  votesNo: number;
  quorumRequired: number;
  totalCouncilMembers: number;
}

export default function QuorumTracker({
  votesYes,
  votesNo,
  quorumRequired,
  totalCouncilMembers,
}: Props) {
  const totalVotes = votesYes + votesNo;
  const progressPct = Math.min((totalVotes / quorumRequired) * 100, 100);
  const quorumReached = totalVotes >= quorumRequired;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between items-center text-xs text-gray-400">
        <span>
          Quorum:{" "}
          <span className={quorumReached ? "text-green-400 font-semibold" : "text-white font-semibold"}>
            {totalVotes}/{quorumRequired} votes
          </span>
        </span>
        <span>{totalCouncilMembers} council members</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            quorumReached ? "bg-green-500" : "bg-indigo-500"
          }`}
          style={{ width: `${progressPct}%` }}
          role="progressbar"
          aria-valuenow={totalVotes}
          aria-valuemin={0}
          aria-valuemax={quorumRequired}
          aria-label={`${totalVotes} of ${quorumRequired} votes cast`}
        />
      </div>

      {/* Yes / No breakdown */}
      <div className="flex gap-4 text-xs">
        <span className="text-green-400">✓ Yes: {votesYes}</span>
        <span className="text-red-400">✗ No: {votesNo}</span>
        {quorumReached && (
          <span className="text-green-400 font-semibold ml-auto">Quorum reached</span>
        )}
      </div>
    </div>
  );
}
