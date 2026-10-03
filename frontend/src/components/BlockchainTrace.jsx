import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Check,
  ExternalLink,
  Hexagon,
  RefreshCw,
  ShieldCheck,
  DatabaseZap,
  ArrowLeft
} from 'lucide-react';

export default function BlockchainTrace() {
  const [batches, setBatches] = useState([]);
  const [selected, setSelected] = useState('');
  const [chain, setChain] = useState(null);
  const [busy, setBusy] = useState(false);
  const [anchoring, setAnchoring] = useState(false);
  const [error, setError] = useState('');

  const [searchParams] = useSearchParams();

  /*
   * IMPORTANT:
   * Use the same backend URL as the rest of the frontend.
   *
   * Local:
   * VITE_API_URL=http://localhost:8000
   *
   * Render:
   * VITE_API_URL=https://your-backend.onrender.com
   */
  const API = `${(import.meta.env.VITE_API_URL || '').replace(/\/$/, '')}/api`;

  const token = () => localStorage.getItem('hcToken');

  const api = async (path, options = {}) => {
    const headers = {
      ...(options.headers || {})
    };

    if (token()) {
      headers.Authorization = `Bearer ${token()}`;
    }

    const response = await fetch(`${API}${path}`, {
      ...options,
      headers
    });

    if (!response.ok) {
      let data = {};

      try {
        data = await response.json();
      } catch (_) {}

      throw new Error(data.detail || `Request failed (${response.status})`);
    }

    return response.json();
  };

  const load = async () => {
    setBusy(true);
    setError('');

    try {
      const [overview, batchResponse] = await Promise.all([
        api('/blockchain/overview'),
        api('/batches')
      ]);

      const list = Array.isArray(batchResponse)
        ? batchResponse.map((batch) => ({
            ...batch,
            batchId: batch.batch_id || batch.batchId,
            hiveId: batch.hive_code || batch.hiveId,
            honeyType: batch.honey_type || batch.honeyType,
            harvestDate: batch.harvest_date || batch.harvestDate
          }))
        : [];

      setBatches(list);
      setChain(overview);

      const requested = searchParams.get('batch');

      if (
        requested &&
        list.some((batch) => batch.batchId === requested)
      ) {
        setSelected(requested);
      } else if (!selected && list.length > 0) {
        setSelected(list[0].batchId);
      }
    } catch (e) {
      setError(e.message || 'Unable to load blockchain ledger');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, [searchParams]);

  useEffect(() => {
    if (!selected) return;

    api(`/batches/${encodeURIComponent(selected)}/blockchain`)
      .then((data) => {
        setChain((current) => ({
          ...current,
          selectedBatch: data
        }));
      })
      .catch((e) => {
        setError(e.message || 'Unable to load batch blockchain');
      });
  }, [selected]);

  const blocks = useMemo(() => {
    if (Array.isArray(chain?.selectedBatch?.blocks)) {
      return chain.selectedBatch.blocks;
    }

    if (Array.isArray(chain?.blocks)) {
      return chain.blocks;
    }

    return [];
  }, [chain]);

  const anchorExisting = async () => {
    setAnchoring(true);
    setError('');

    try {
      const response = await fetch(
        `${API}/blockchain/anchor-existing`,
        {
          method: 'POST',
          headers: token()
            ? {
                Authorization: `Bearer ${token()}`
              }
            : {}
        }
      );

      let data = {};

      try {
        data = await response.json();
      } catch (_) {}

      if (!response.ok) {
        throw new Error(
          data.detail || `Anchoring failed (${response.status})`
        );
      }

      setChain((current) => ({
        ...current,
        ...data
      }));

      await load();
    } catch (e) {
      setError(e.message || 'Anchoring failed');
    } finally {
      setAnchoring(false);
    }
  };

  return (
    <>
      <button
        className="backLink"
        type="button"
        onClick={() => window.history.back()}
      >
        <ArrowLeft size={16} />
        Back
      </button>

      <div className="pageTitle">
        <div>
          <div className="eyebrow">
            BLOCKCHAIN · LIVE LEDGER
          </div>

          <h1>Blockchain Trace</h1>

          <p>
            Every hive, sensor, health, harvest, processing,
            packaging and QR event is linked into one verifiable
            ledger.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap'
          }}
        >
          <button
            className="outlineBtn"
            onClick={load}
            disabled={busy}
          >
            <RefreshCw size={16} />
            Refresh ledger
          </button>

          {chain?.chainConfigured && (
            <button
              className="goldBtn"
              onClick={anchorExisting}
              disabled={anchoring}
            >
              {anchoring
                ? 'Anchoring…'
                : 'Anchor existing blocks'}
              <ShieldCheck size={16} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          className="errorBox"
          style={{ marginBottom: 18 }}
        >
          {error}
        </div>
      )}

      {busy && !chain ? (
        <div className="emptyState">
          <b>Reading the ledger…</b>
        </div>
      ) : (
        chain && (
          <>
            <div className="statsGrid">

              {/* LOCAL CHAIN */}
              <div className="stat">
                <div className="statIcon">
                  <ShieldCheck size={19} />
                </div>

                <span>
                  <small>Local chain</small>

                  <b>
                    {chain.verified
                      ? 'Verified'
                      : 'Invalid'}
                  </b>

                  <em>
                    SHA-256 links checked live
                  </em>
                </span>
              </div>

              {/* TOTAL BLOCKS */}
              <div className="stat">
                <div className="statIcon">
                  <Box size={19} />
                </div>

                <span>
                  <small>Total blocks</small>

                  <b>
                    {chain.blockCount ?? 0}
                  </b>

                  <em>
                    Across all levels
                  </em>
                </span>
              </div>

              {/* PUBLIC NETWORK */}
              <div className="stat">
                <div className="statIcon">
                  <DatabaseZap size={19} />
                </div>

                <span>
                  <small>Public network</small>

                  <b>
                    {chain.chainConfigured
                      ? chain.network || 'EVM connected'
                      : 'Not connected'}
                  </b>

                  <em>
                    {chain.chainConfigured
                      ? `Chain ID : ${
                          chain.chainId ?? '—'
                        }`
                      : 'Set Polygon RPC + contract env vars'}
                  </em>
                </span>
              </div>

            </div>

            {/* PUBLIC BLOCKCHAIN CONFIGURATION */}
            {chain.chainConfigured && (
              <div
                className="successBox"
                style={{ marginTop: 16 }}
              >
                <b>
                  Public blockchain connected
                </b>

                <div style={{ marginTop: 6 }}>
                  Contract address :{' '}
                  {chain.contractAddress || '—'}
                </div>

                <div>
                  Anchor wallet :{' '}
                  {chain.anchorWallet || '—'}
                </div>
              </div>
            )}

            {/* LEVEL COVERAGE */}
            <section
              className="panel"
              style={{ marginTop: 20 }}
            >
              <div className="panelHeading">
                <div>
                  <small>
                    LIVE LEVEL COVERAGE
                  </small>

                  <h2>
                    What is actually on-chain
                  </h2>
                </div>

                <span
                  className={`status ${
                    chain.verified
                      ? 'verified'
                      : 'monitor'
                  }`}
                >
                  {chain.chainConfigured
                    ? 'Public anchor enabled'
                    : 'Hash chain verified'}
                </span>
              </div>

              <div className="hiveMiniGrid">
                {(chain.levels || []).map(
                  (level, index) => (
                    <div
                      className="hiveMini"
                      key={`${level.level}-${index}`}
                    >
                      <div className="hiveMiniTop">
                        <span className="hiveIcon">
                          <Hexagon size={18} />
                        </span>

                        <b>
                          {level.count}
                        </b>
                      </div>

                      <b>
                        {level.level}
                      </b>

                      <small>
                        Ledger blocks recorded
                      </small>
                    </div>
                  )
                )}
              </div>
            </section>

            {/* BATCH VIEW */}
            <section
              className="panel"
              style={{ marginTop: 20 }}
            >
              <div className="panelHeading">
                <div>
                  <small>
                    BATCH VIEW
                  </small>

                  <h2>
                    Trace one production journey
                  </h2>
                </div>

                <label style={{ minWidth: 260 }}>
                  <span className="selectWrap">
                    <select
                      value={selected}
                      onChange={(e) =>
                        setSelected(e.target.value)
                      }
                    >
                      <option value="">
                        All ledger blocks
                      </option>

                      {batches.map((batch) => (
                        <option
                          key={batch.batchId}
                          value={batch.batchId}
                        >
                          {batch.batchId}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              </div>

              {/* BLOCKCHAIN TIMELINE */}
              <div className="blockchainTimeline">

                {blocks.map((block, index) => {
                  let payload = {};

                  try {
                    payload = JSON.parse(
                      block.payload || '{}'
                    );
                  } catch (_) {}

                  const tx =
                    block.onchain_tx_hash;

                  return (
                    <div
                      className="blockCard"
                      key={`${block.block_index}-${block.block_hash}`}
                    >
                      <div className="blockNumber">
                        #{block.block_index}
                      </div>

                      <div className="blockBody">

                        <small>
                          {block.level ||
                            payload.level ||
                            payload.event_type ||
                            'Traceability'}

                          {' · '}

                          {payload.event_date ||
                            block.created_at ||
                            '—'}
                        </small>

                        <b>
                          {payload.description ||
                            payload.stage ||
                            'Record anchored'}
                        </b>

                        <div className="hashRows">

                          <span>
                            Previous hash
                          </span>

                          <code>
                            {String(
                              block.previous_hash
                            ).slice(0, 28)}
                            …
                          </code>

                          <span>
                            Block hash
                          </span>

                          <code>
                            {String(
                              block.block_hash
                            ).slice(0, 28)}
                            …
                          </code>

                          {tx && (
                            <>
                              <span>
                                Public tx
                              </span>

                              <code>
                                {String(tx).slice(
                                  0,
                                  28
                                )}
                                …
                              </code>
                            </>
                          )}

                        </div>

                        {tx &&
                          chain.explorerUrl && (
                            <a
                              className="textButton"
                              href={`${chain.explorerUrl}/tx/${tx}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open blockchain transaction
                              <ExternalLink size={14} />
                            </a>
                          )}

                      </div>

                      {index <
                        blocks.length - 1 && (
                        <div className="chainArrow">
                          ↓
                        </div>
                      )}

                    </div>
                  );
                })}

              </div>

              {!blocks.length && (
                <div className="emptyState">
                  <b>
                    No blocks for this selection yet.
                  </b>

                  <p>
                    Create a hive, record an IoT
                    reading, run health analysis or
                    create a batch to add the next
                    live event.
                  </p>
                </div>
              )}

              <div
                className="successBox"
                style={{ marginTop: 18 }}
              >
                <b>
                  <Check size={16} />
                  Verification is calculated from the
                  live database
                </b>

                <br />

                HoneyChain recomputes every block hash
                and previous-hash link. When EVM
                anchoring is configured, the same block
                hash is also submitted to the deployed
                smart contract.
              </div>

            </section>
          </>
        )
      )}
    </>
  );
}