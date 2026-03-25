"use client";

import { useState, useEffect, useRef } from "react";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  startAfter,
  getDocs,
} from "firebase/firestore";
import { db } from "../lib/firebase";

interface Comment {
  id: string;
  marketId: number;
  walletAddress: string;
  text: string;
  createdAt: Timestamp;
}

interface Props {
  marketId: number;
  walletAddress: string | null;
}

const COMMENTS_PER_PAGE = 10;

export default function MarketComments({ marketId, walletAddress }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState("");
  const lastCommentRef = useRef<any>(null);

  // Real-time listener for new comments
  useEffect(() => {
    const q = query(
      collection(db, "marketComments"),
      where("marketId", "==", marketId),
      orderBy("createdAt", "desc"),
      limit(COMMENTS_PER_PAGE)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const newComments: Comment[] = [];
        snapshot.forEach((doc) => {
          newComments.push({ id: doc.id, ...doc.data() } as Comment);
        });
        setComments(newComments);
        
        // Update last comment reference for pagination
        if (snapshot.docs.length > 0) {
          lastCommentRef.current = snapshot.docs[snapshot.docs.length - 1];
        }
        
        // Check if there are more comments
        setHasMore(snapshot.docs.length === COMMENTS_PER_PAGE);
      },
      (err) => {
        console.error("Error listening to comments:", err);
        setError("Failed to load comments");
      }
    );

    return () => unsubscribe();
  }, [marketId]);

  // Load more comments (pagination)
  const loadMoreComments = async () => {
    if (!lastCommentRef.current || loadingMore) return;

    setLoadingMore(true);
    try {
      const q = query(
        collection(db, "marketComments"),
        where("marketId", "==", marketId),
        orderBy("createdAt", "desc"),
        startAfter(lastCommentRef.current),
        limit(COMMENTS_PER_PAGE)
      );

      const snapshot = await getDocs(q);
      const moreComments: Comment[] = [];
      snapshot.forEach((doc) => {
        moreComments.push({ id: doc.id, ...doc.data() } as Comment);
      });

      setComments((prev) => [...prev, ...moreComments]);
      
      if (snapshot.docs.length > 0) {
        lastCommentRef.current = snapshot.docs[snapshot.docs.length - 1];
      }
      
      setHasMore(snapshot.docs.length === COMMENTS_PER_PAGE);
    } catch (err) {
      console.error("Error loading more comments:", err);
      setError("Failed to load more comments");
    } finally {
      setLoadingMore(false);
    }
  };

  // Post a new comment
  const postComment = async () => {
    if (!newComment.trim() || !walletAddress) return;

    setLoading(true);
    setError("");

    try {
      await addDoc(collection(db, "marketComments"), {
        marketId,
        walletAddress,
        text: newComment.trim(),
        createdAt: Timestamp.now(),
      });

      setNewComment("");
    } catch (err: any) {
      console.error("Error posting comment:", err);
      setError(err.message || "Failed to post comment");
    } finally {
      setLoading(false);
    }
  };

  // Format timestamp
  const formatTime = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Truncate wallet address
  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <h3 className="text-white font-semibold text-lg mb-4">Discussion</h3>

      {/* Comment input */}
      {walletAddress ? (
        <div className="mb-4">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts on this market..."
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm outline-none border border-gray-700 focus:border-blue-500 resize-none"
            rows={3}
            maxLength={500}
          />
          <div className="flex justify-between items-center mt-2">
            <span className="text-xs text-gray-500">
              {newComment.length}/500
            </span>
            <button
              onClick={postComment}
              disabled={loading || !newComment.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              {loading ? "Posting..." : "Post Comment"}
            </button>
          </div>
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>
      ) : (
        <div className="mb-4 p-3 bg-gray-800 rounded-lg text-center">
          <p className="text-gray-400 text-sm">
            Connect your wallet to join the discussion
          </p>
        </div>
      )}

      {/* Comments list */}
      <div className="space-y-3">
        {comments.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">
            No comments yet. Be the first to share your thoughts!
          </p>
        ) : (
          <>
            {comments.map((comment) => (
              <div
                key={comment.id}
                className="bg-gray-800 rounded-lg p-3 border border-gray-700"
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {comment.walletAddress.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white text-sm font-medium">
                        {truncateAddress(comment.walletAddress)}
                      </p>
                      <p className="text-gray-500 text-xs">
                        {formatTime(comment.createdAt)}
                      </p>
                    </div>
                  </div>
                  {comment.walletAddress === walletAddress && (
                    <span className="text-xs bg-blue-900 text-blue-300 px-2 py-1 rounded">
                      You
                    </span>
                  )}
                </div>
                <p className="text-gray-300 text-sm whitespace-pre-wrap break-words">
                  {comment.text}
                </p>
              </div>
            ))}

            {/* Load more button */}
            {hasMore && (
              <button
                onClick={loadMoreComments}
                disabled={loadingMore}
                className="w-full py-2 text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
              >
                {loadingMore ? "Loading..." : "Load more comments"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
