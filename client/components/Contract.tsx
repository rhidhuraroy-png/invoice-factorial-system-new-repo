"use client";

import { useState, useCallback } from "react";
import {
  createInvoice,
  fundInvoice,
  markPaid,
  claimPayment,
  getInvoice,
  CONTRACT_ADDRESS,
} from "@/hooks/contract";
import { AnimatedCard } from "@/components/ui/animated-card";
import { Spotlight } from "@/components/ui/spotlight";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Icons ────────────────────────────────────────────────────

function SpinnerIcon() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function DollarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
      <path d="M12 18V6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function ClaimIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

// ── Styled Input ─────────────────────────────────────────────

function Input({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-medium uppercase tracking-wider text-white/30">
        {label}
      </label>
      <div className="group rounded-xl border border-white/[0.06] bg-white/[0.02] p-px transition-all focus-within:border-[#7c6cf0]/30 focus-within:shadow-[0_0_20px_rgba(124,108,240,0.08)]">
        <input
          {...props}
          className="w-full rounded-[11px] bg-transparent px-4 py-3 font-mono text-sm text-white/90 placeholder:text-white/15 outline-none"
        />
      </div>
    </div>
  );
}

// ── Method Signature ─────────────────────────────────────────

function MethodSignature({
  name,
  params,
  returns,
  color,
}: {
  name: string;
  params: string;
  returns?: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 font-mono text-sm">
      <span style={{ color }} className="font-semibold">fn</span>
      <span className="text-white/70">{name}</span>
      <span className="text-white/20 text-xs">{params}</span>
      {returns && (
        <span className="ml-auto text-white/15 text-[10px]">{returns}</span>
      )}
    </div>
  );
}

// ── Status Config ────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; dot: string; variant: "success" | "warning" | "info" | "error" }> = {
  Open: { color: "text-[#fbbf24]", bg: "bg-[#fbbf24]/10", border: "border-[#fbbf24]/20", dot: "bg-[#fbbf24]", variant: "warning" },
  Funded: { color: "text-[#4fc3f7]", bg: "bg-[#4fc3f7]/10", border: "border-[#4fc3f7]/20", dot: "bg-[#4fc3f7]", variant: "info" },
  Paid: { color: "text-[#34d399]", bg: "bg-[#34d399]/10", border: "border-[#34d399]/20", dot: "bg-[#34d399]", variant: "success" },
  Claimed: { color: "text-[#a78bfa]", bg: "bg-[#a78bfa]/10", border: "border-[#a78bfa]/20", dot: "bg-[#a78bfa]", variant: "success" },
};

function getStatus(inv: Record<string, unknown>): string {
  if (inv.claimed) return "Claimed";
  if (inv.paid) return "Paid";
  if (inv.funded) return "Funded";
  return "Open";
}

// ── Main Component ───────────────────────────────────────────

type Tab = "create" | "fund" | "paid" | "claim" | "lookup";

interface ContractUIProps {
  walletAddress: string | null;
  onConnect: () => void;
  isConnecting: boolean;
}

export default function ContractUI({ walletAddress, onConnect, isConnecting }: ContractUIProps) {
  const [activeTab, setActiveTab] = useState<Tab>("create");
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // Create
  const [faceValue, setFaceValue] = useState("");
  const [discountRate, setDiscountRate] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Fund
  const [fundId, setFundId] = useState("");
  const [isFunding, setIsFunding] = useState(false);

  // Mark Paid
  const [paidId, setPaidId] = useState("");
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  // Claim
  const [claimId, setClaimId] = useState("");
  const [isClaiming, setIsClaiming] = useState(false);

  // Lookup
  const [lookupId, setLookupId] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [invoiceData, setInvoiceData] = useState<Record<string, unknown> | null>(null);

  const truncate = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const handleCreateInvoice = useCallback(async () => {
    if (!walletAddress) return setError("Connect wallet first");
    const fv = BigInt(faceValue);
    const dr = parseInt(discountRate);
    if (!fv || fv <= BigInt(0)) return setError("Enter a valid face value");
    if (!dr || dr <= 0 || dr >= 10000) return setError("Discount rate must be 1-9999 bps");
    setError(null);
    setIsCreating(true);
    setTxStatus("Awaiting signature...");
    try {
      await createInvoice(walletAddress, fv, dr);
      setTxStatus("Invoice created on-chain!");
      setFaceValue("");
      setDiscountRate("");
      setTimeout(() => setTxStatus(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus(null);
    } finally {
      setIsCreating(false);
    }
  }, [walletAddress, faceValue, discountRate]);

  const handleFundInvoice = useCallback(async () => {
    if (!walletAddress) return setError("Connect wallet first");
    const id = BigInt(fundId);
    if (!id || id <= BigInt(0)) return setError("Enter a valid invoice ID");
    setError(null);
    setIsFunding(true);
    setTxStatus("Awaiting signature...");
    try {
      await fundInvoice(walletAddress, id);
      setTxStatus("Invoice funded on-chain!");
      setFundId("");
      setTimeout(() => setTxStatus(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus(null);
    } finally {
      setIsFunding(false);
    }
  }, [walletAddress, fundId]);

  const handleMarkPaid = useCallback(async () => {
    if (!walletAddress) return setError("Connect wallet first");
    const id = BigInt(paidId);
    if (!id || id <= BigInt(0)) return setError("Enter a valid invoice ID");
    setError(null);
    setIsMarkingPaid(true);
    setTxStatus("Awaiting signature...");
    try {
      await markPaid(walletAddress, id);
      setTxStatus("Invoice marked as paid!");
      setPaidId("");
      setTimeout(() => setTxStatus(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus(null);
    } finally {
      setIsMarkingPaid(false);
    }
  }, [walletAddress, paidId]);

  const handleClaimPayment = useCallback(async () => {
    if (!walletAddress) return setError("Connect wallet first");
    const id = BigInt(claimId);
    if (!id || id <= BigInt(0)) return setError("Enter a valid invoice ID");
    setError(null);
    setIsClaiming(true);
    setTxStatus("Awaiting signature...");
    try {
      await claimPayment(walletAddress, id);
      setTxStatus("Payment claimed on-chain!");
      setClaimId("");
      setTimeout(() => setTxStatus(null), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setTxStatus(null);
    } finally {
      setIsClaiming(false);
    }
  }, [walletAddress, claimId]);

  const handleLookup = useCallback(async () => {
    const id = BigInt(lookupId);
    if (!id || id <= BigInt(0)) return setError("Enter a valid invoice ID");
    setError(null);
    setIsLookingUp(true);
    setInvoiceData(null);
    try {
      const result = await getInvoice(id, walletAddress || undefined);
      if (result && typeof result === "object") {
        setInvoiceData(result as Record<string, unknown>);
      } else {
        setError("Invoice not found");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setIsLookingUp(false);
    }
  }, [lookupId, walletAddress]);

  const tabs: { key: Tab; label: string; icon: React.ReactNode; color: string }[] = [
    { key: "lookup", label: "Lookup", icon: <SearchIcon />, color: "#4fc3f7" },
    { key: "create", label: "Create", icon: <PlusIcon />, color: "#7c6cf0" },
    { key: "fund", label: "Fund", icon: <DollarIcon />, color: "#fbbf24" },
    { key: "paid", label: "Mark Paid", icon: <CheckIcon />, color: "#34d399" },
    { key: "claim", label: "Claim", icon: <ClaimIcon />, color: "#a78bfa" },
  ];

  const needWallet = (fn: () => void) => {
    if (!walletAddress) return onConnect();
    fn();
  };

  return (
    <div className="w-full max-w-2xl animate-fade-in-up-delayed">
      {/* Toasts */}
      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-[#f87171]/15 bg-[#f87171]/[0.05] px-4 py-3 backdrop-blur-sm animate-slide-down">
          <span className="mt-0.5 text-[#f87171]"><AlertIcon /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#f87171]/90">Error</p>
            <p className="text-xs text-[#f87171]/50 mt-0.5 break-all">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="shrink-0 text-[#f87171]/30 hover:text-[#f87171]/70 text-lg leading-none">&times;</button>
        </div>
      )}

      {txStatus && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#34d399]/15 bg-[#34d399]/[0.05] px-4 py-3 backdrop-blur-sm shadow-[0_0_30px_rgba(52,211,153,0.05)] animate-slide-down">
          <span className="text-[#34d399]">
            {txStatus.includes("on-chain") || txStatus.includes("marked") || txStatus.includes("claimed") ? <CheckIcon /> : <SpinnerIcon />}
          </span>
          <span className="text-sm text-[#34d399]/90">{txStatus}</span>
        </div>
      )}

      {/* Main Card */}
      <Spotlight className="rounded-2xl">
        <AnimatedCard className="p-0" containerClassName="rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#7c6cf0]/20 to-[#4fc3f7]/20 border border-white/[0.06]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#7c6cf0]">
                  <rect width="20" height="14" x="2" y="5" rx="2" />
                  <line x1="2" x2="22" y1="10" y2="10" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white/90">Invoice Factoring</h3>
                <p className="text-[10px] text-white/25 font-mono mt-0.5">{truncate(CONTRACT_ADDRESS)}</p>
              </div>
            </div>
            <Badge variant="info" className="text-[10px]">Permissionless</Badge>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-white/[0.06] px-2 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setError(null); setInvoiceData(null); }}
                className={cn(
                  "relative flex items-center gap-2 px-4 py-3.5 text-sm font-medium transition-all whitespace-nowrap",
                  activeTab === t.key ? "text-white/90" : "text-white/35 hover:text-white/55"
                )}
              >
                <span style={activeTab === t.key ? { color: t.color } : undefined}>{t.icon}</span>
                {t.label}
                {activeTab === t.key && (
                  <span
                    className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full transition-all"
                    style={{ background: `linear-gradient(to right, ${t.color}, ${t.color}66)` }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {/* Lookup */}
            {activeTab === "lookup" && (
              <div className="space-y-5">
                <MethodSignature name="get_invoice" params="(invoice_id: u64)" returns="-> Invoice" color="#4fc3f7" />
                <Input label="Invoice ID" value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="e.g. 1" />
                <ShimmerButton onClick={handleLookup} disabled={isLookingUp} shimmerColor="#4fc3f7" className="w-full">
                  {isLookingUp ? <><SpinnerIcon /> Querying...</> : <><SearchIcon /> Look Up Invoice</>}
                </ShimmerButton>

                {invoiceData && (
                  <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden animate-fade-in-up">
                    <div className="border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-white/25">Invoice #{lookupId}</span>
                      {(() => {
                        const status = getStatus(invoiceData);
                        const cfg = STATUS_CONFIG[status];
                        return cfg ? (
                          <Badge variant={cfg.variant as "success" | "warning" | "info"}>
                            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                            {status}
                          </Badge>
                        ) : (
                          <Badge>{status}</Badge>
                        );
                      })()}
                    </div>
                    <div className="p-4 space-y-3">
                      {[
                        { label: "Creator", key: "creator" },
                        { label: "Face Value", key: "face_value" },
                        { label: "Discount (bps)", key: "discount_rate" },
                        { label: "Factor", key: "factor" },
                        { label: "Funded", key: "funded" },
                        { label: "Paid", key: "paid" },
                        { label: "Claimed", key: "claimed" },
                      ].map(({ label, key }) => {
                        const val = invoiceData[key];
                        if (val === undefined || val === null) return null;
                        const display = typeof val === "object" ? JSON.stringify(val) : String(val);
                        return (
                          <div key={key} className="flex items-center justify-between">
                            <span className="text-xs text-white/35">{label}</span>
                            <span className="font-mono text-xs text-white/80 max-w-[60%] truncate">{display}</span>
                          </div>
                        );
                      })}
                      {(() => {
                        const fv = Number(invoiceData.face_value || 0);
                        const dr = Number(invoiceData.discount_rate || 0);
                        if (fv > 0 && dr > 0) {
                          const discounted = Math.floor(fv * (10000 - dr) / 10000);
                          return (
                            <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 mt-1">
                              <span className="text-xs text-white/35">Discounted Price</span>
                              <span className="font-mono text-sm text-[#fbbf24]">{discounted}</span>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Create */}
            {activeTab === "create" && (
              <div className="space-y-5">
                <MethodSignature name="create_invoice" params="(creator, face_value, discount_rate)" returns="-> u64" color="#7c6cf0" />
                <Input label="Face Value (amount owed)" value={faceValue} onChange={(e) => setFaceValue(e.target.value)} placeholder="e.g. 10000" type="number" />
                <Input label="Discount Rate (basis points, 100 = 1%)" value={discountRate} onChange={(e) => setDiscountRate(e.target.value)} placeholder="e.g. 300 (3%)" type="number" />
                {faceValue && discountRate && (
                  <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3 text-xs text-white/30 font-mono">
                    Factor pays: <span className="text-[#fbbf24]">
                      {(() => {
                        try {
                          const fv = BigInt(faceValue);
                          const dr = parseInt(discountRate);
                          if (fv > BigInt(0) && dr > 0 && dr < 10000) {
                            return String(fv * BigInt(10000 - dr) / BigInt(10000));
                          }
                        } catch {}
                        return "—";
                      })()}
                    </span> ({discountRate}% discount)
                  </div>
                )}
                {walletAddress ? (
                  <ShimmerButton onClick={handleCreateInvoice} disabled={isCreating} shimmerColor="#7c6cf0" className="w-full">
                    {isCreating ? <><SpinnerIcon /> Creating...</> : <><PlusIcon /> Create Invoice</>}
                  </ShimmerButton>
                ) : (
                  <button
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="w-full rounded-xl border border-dashed border-[#7c6cf0]/20 bg-[#7c6cf0]/[0.03] py-4 text-sm text-[#7c6cf0]/60 hover:border-[#7c6cf0]/30 hover:text-[#7c6cf0]/80 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    Connect wallet to create invoices
                  </button>
                )}
              </div>
            )}

            {/* Fund */}
            {activeTab === "fund" && (
              <div className="space-y-5">
                <MethodSignature name="fund_invoice" params="(factor, invoice_id)" returns="-> i128" color="#fbbf24" />
                <Input label="Invoice ID" value={fundId} onChange={(e) => setFundId(e.target.value)} placeholder="e.g. 1" type="number" />
                {walletAddress ? (
                  <ShimmerButton onClick={handleFundInvoice} disabled={isFunding} shimmerColor="#fbbf24" className="w-full">
                    {isFunding ? <><SpinnerIcon /> Funding...</> : <><DollarIcon /> Fund Invoice</>}
                  </ShimmerButton>
                ) : (
                  <button
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="w-full rounded-xl border border-dashed border-[#fbbf24]/20 bg-[#fbbf24]/[0.03] py-4 text-sm text-[#fbbf24]/60 hover:border-[#fbbf24]/30 hover:text-[#fbbf24]/80 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    Connect wallet to fund invoices
                  </button>
                )}
              </div>
            )}

            {/* Mark Paid */}
            {activeTab === "paid" && (
              <div className="space-y-5">
                <MethodSignature name="mark_paid" params="(caller, invoice_id)" color="#34d399" />
                <Input label="Invoice ID" value={paidId} onChange={(e) => setPaidId(e.target.value)} placeholder="e.g. 1" type="number" />
                {walletAddress ? (
                  <ShimmerButton onClick={handleMarkPaid} disabled={isMarkingPaid} shimmerColor="#34d399" className="w-full">
                    {isMarkingPaid ? <><SpinnerIcon /> Marking...</> : <><CheckIcon /> Mark as Paid</>}
                  </ShimmerButton>
                ) : (
                  <button
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="w-full rounded-xl border border-dashed border-[#34d399]/20 bg-[#34d399]/[0.03] py-4 text-sm text-[#34d399]/60 hover:border-[#34d399]/30 hover:text-[#34d399]/80 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    Connect wallet to mark as paid
                  </button>
                )}
              </div>
            )}

            {/* Claim */}
            {activeTab === "claim" && (
              <div className="space-y-5">
                <MethodSignature name="claim_payment" params="(factor, invoice_id)" returns="-> i128" color="#a78bfa" />
                <Input label="Invoice ID" value={claimId} onChange={(e) => setClaimId(e.target.value)} placeholder="e.g. 1" type="number" />
                {walletAddress ? (
                  <ShimmerButton onClick={handleClaimPayment} disabled={isClaiming} shimmerColor="#a78bfa" className="w-full">
                    {isClaiming ? <><SpinnerIcon /> Claiming...</> : <><ClaimIcon /> Claim Payment</>}
                  </ShimmerButton>
                ) : (
                  <button
                    onClick={onConnect}
                    disabled={isConnecting}
                    className="w-full rounded-xl border border-dashed border-[#a78bfa]/20 bg-[#a78bfa]/[0.03] py-4 text-sm text-[#a78bfa]/60 hover:border-[#a78bfa]/30 hover:text-[#a78bfa]/80 active:scale-[0.99] transition-all disabled:opacity-50"
                  >
                    Connect wallet to claim payment
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-white/[0.04] px-6 py-3 flex items-center justify-between">
            <p className="text-[10px] text-white/15">Invoice Factoring &middot; Permissionless &middot; Soroban</p>
            <div className="flex items-center gap-2">
              {["Open", "Funded", "Paid", "Claimed"].map((s, i) => (
                <span key={s} className="flex items-center gap-1.5">
                  <span className={cn("h-1 w-1 rounded-full", STATUS_CONFIG[s]?.dot ?? "bg-white/20")} />
                  <span className="font-mono text-[9px] text-white/15">{s}</span>
                  {i < 3 && <span className="text-white/10 text-[8px]">&rarr;</span>}
                </span>
              ))}
            </div>
          </div>
        </AnimatedCard>
      </Spotlight>
    </div>
  );
}
