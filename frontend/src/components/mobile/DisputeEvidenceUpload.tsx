import { useState } from "react";
import { PinataSDK } from "pinata";

const pinata = new PinataSDK({
  pinataJwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIyNDM4NWEwMC1iMTAyLTRhZDEtODhiNC1kZmRmODYyYTU1MDciLCJlbWFpbCI6Im5lZHpvZXlAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiRlJBMSJ9LHsiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjEsImlkIjoiTllDMSJ9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6IjJjN2IxMTk4ZDlhYjg3MWYwNDIzIiwic2NvcGVkS2V5U2VjcmV0IjoiNmY0ZTRkZjgwMTE0OTQ3MWRlMDliOWVlMTc5OTExM2M0YjM0NDUzMDFlYmM5YzY5MjI1M2IyNjEyMDYyOGJjNiIsImV4cCI6MTgwNTk2OTU4OH0.jrS2DRnX9cXExMVvj3LU_OQnJpBK2pTqvE3VtmGjmvY",
  pinataGateway: "gateway.pinata.cloud",
});

export default function DisputeEvidenceUpload({ onCIDGenerated }: { onCIDGenerated?: (cid: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [cid, setCid] = useState<string | null>(null);
  const [status, setStatus] = useState("idle");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const allowed = ["image/png", "application/pdf"];
    if (!allowed.includes(selected.type)) {
      alert("Only PNG or PDF files are allowed.");
      return;
    }
    setFile(selected);
    setStatus("idle");
    setCid(null);
    setProgress(0);
  };

  const uploadToIPFS = async () => {
    if (!file) return alert("Please select a file first.");
    setStatus("uploading");
    setProgress(20);
    try {
      setProgress(50);
      const upload = await pinata.upload.public.file(file);
      setProgress(100);
      const generatedCid = upload.cid;
      setCid(generatedCid);
      setStatus("complete");
      if (onCIDGenerated) onCIDGenerated(generatedCid);
    } catch (err) {
      console.error(err);
      setStatus("error");
      alert("Upload failed. Please try again.");
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.title}>📎 Upload Dispute Evidence</h2>
      <p style={styles.subtitle}>Accepted formats: PNG, PDF</p>
      <input type="file" accept=".png,.pdf" onChange={handleFileChange} style={styles.input} />
      {file && <p style={styles.fileName}>Selected: {file.name}</p>}
      <button onClick={uploadToIPFS} disabled={!file || status === "uploading"} style={styles.button}>
        {status === "uploading" ? "Uploading..." : "Upload to IPFS"}
      </button>
      {(status === "uploading" || status === "complete") && (
        <div style={styles.progressContainer}>
          <div style={{ ...styles.progressBar, width: `${progress}%` }} />
        </div>
      )}
      {status === "complete" && cid && (
        <div style={styles.successBox}>
          <p>✅ Upload Complete!</p>
          <p style={styles.cidLabel}>CID:</p>
          <p style={styles.cid}>{cid}</p>
          <a href={`https://gateway.pinata.cloud/ipfs/${cid}`} target="_blank" rel="noreferrer" style={styles.link}>
            View on IPFS Gateway
          </a>
        </div>
      )}
      {status === "error" && <p style={styles.error}>❌ Upload failed. Please try again.</p>}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: "480px", margin: "40px auto", padding: "24px", borderRadius: "12px", background: "#1a1a2e", color: "#fff", fontFamily: "sans-serif", boxShadow: "0 4px 20px rgba(0,0,0,0.4)" },
  title: { fontSize: "20px", marginBottom: "4px" },
  subtitle: { fontSize: "13px", color: "#aaa", marginBottom: "16px" },
  input: { marginBottom: "12px", color: "#fff" },
  fileName: { fontSize: "13px", color: "#ccc", marginBottom: "12px" },
  button: { background: "#6c63ff", color: "#fff", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontSize: "15px", marginBottom: "16px" },
  progressContainer: { height: "10px", background: "#333", borderRadius: "5px", overflow: "hidden", marginBottom: "16px" },
  progressBar: { height: "100%", background: "#6c63ff", transition: "width 0.4s ease" },
  successBox: { background: "#0f3460", padding: "16px", borderRadius: "8px", wordBreak: "break-all" },
  cidLabel: { fontWeight: "bold", marginTop: "8px" },
  cid: { fontSize: "12px", color: "#a0e0ff" },
  link: { color: "#6c63ff", fontSize: "13px" },
  error: { color: "#ff6b6b" },
};