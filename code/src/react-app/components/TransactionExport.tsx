import { useState } from 'react';
import { X, Download, FileText, FileSpreadsheet, Calendar, Loader2, Check, AlertTriangle } from 'lucide-react';

interface Transaction {
  id: string;
  type: 'sent' | 'received';
  to: string;
  from: string;
  amount: string;
  currency: string;
  kasAmount: string;
  timestamp: string;
  status: string;
  txHash?: string;
}

interface TransactionExportProps {
  transactions: Transaction[];
  onClose: () => void;
}

type ExportFormat = 'csv' | 'pdf';
type DateRange = 'all' | 'year' | 'quarter' | 'month' | 'custom';

export default function TransactionExport({ transactions, onClose }: TransactionExportProps) {
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [dateRange, setDateRange] = useState<DateRange>('year');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [includeKasAmounts, setIncludeKasAmounts] = useState(true);
  const [includeTxHash, setIncludeTxHash] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const getDateRangeFilter = () => {
    const now = new Date();
    let startDate: Date | null = null;
    
    switch (dateRange) {
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'custom':
        startDate = customStartDate ? new Date(customStartDate) : null;
        const endDate = customEndDate ? new Date(customEndDate) : now;
        return { startDate, endDate };
      case 'all':
      default:
        return { startDate: null, endDate: now };
    }
    
    return { startDate, endDate: now };
  };

  const getFilteredTransactions = () => {
    const { startDate, endDate } = getDateRangeFilter();
    
    return transactions.filter(tx => {
      const txDate = new Date(tx.timestamp);
      if (startDate && txDate < startDate) return false;
      if (endDate && txDate > endDate) return false;
      return true;
    });
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toISOString().split('T')[0];
  };

  const formatDateTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  };

  const escapeCSV = (value: string) => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const exportCSV = () => {
    const filteredTxs = getFilteredTransactions();
    
    const headers = [
      'Date',
      'Time',
      'Type',
      'To/From',
      'Amount',
      'Currency',
      ...(includeKasAmounts ? ['KAS Amount'] : []),
      'Status',
      ...(includeTxHash ? ['Transaction Hash'] : []),
    ];
    
    const rows = filteredTxs.map(tx => {
      const date = new Date(tx.timestamp);
      return [
        date.toLocaleDateString(),
        date.toLocaleTimeString(),
        tx.type === 'sent' ? 'Sent' : 'Received',
        tx.type === 'sent' ? tx.to : tx.from,
        tx.type === 'sent' ? `-${tx.amount}` : `+${tx.amount}`,
        tx.currency,
        ...(includeKasAmounts ? [tx.kasAmount] : []),
        tx.status,
        ...(includeTxHash ? [tx.txHash || ''] : []),
      ].map(v => escapeCSV(String(v)));
    });
    
    // Calculate totals
    const sentTotal = filteredTxs
      .filter(tx => tx.type === 'sent')
      .reduce((sum, tx) => sum + parseFloat(tx.kasAmount || '0'), 0);
    const receivedTotal = filteredTxs
      .filter(tx => tx.type === 'received')
      .reduce((sum, tx) => sum + parseFloat(tx.kasAmount || '0'), 0);
    
    const csv = [
      '# Kaspay Transaction Export',
      `# Generated: ${new Date().toISOString()}`,
      `# Period: ${dateRange === 'all' ? 'All Time' : dateRange === 'custom' ? `${customStartDate} to ${customEndDate}` : `Last ${dateRange}`}`,
      `# Total Transactions: ${filteredTxs.length}`,
      `# Total Sent: ${sentTotal.toFixed(8)} KAS`,
      `# Total Received: ${receivedTotal.toFixed(8)} KAS`,
      `# Net: ${(receivedTotal - sentTotal).toFixed(8)} KAS`,
      '',
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kaspay-transactions-${formatDate(new Date().toISOString())}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const filteredTxs = getFilteredTransactions();
    
    // Calculate totals
    const sentTotal = filteredTxs
      .filter(tx => tx.type === 'sent')
      .reduce((sum, tx) => sum + parseFloat(tx.kasAmount || '0'), 0);
    const receivedTotal = filteredTxs
      .filter(tx => tx.type === 'received')
      .reduce((sum, tx) => sum + parseFloat(tx.kasAmount || '0'), 0);
    
    // Generate HTML for PDF
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Kaspay Transaction Report</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
          .header { border-bottom: 2px solid #70C7BA; padding-bottom: 20px; margin-bottom: 30px; }
          .logo { font-size: 28px; font-weight: bold; color: #70C7BA; }
          .subtitle { color: #666; margin-top: 5px; }
          .summary { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
          .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; }
          .summary-item { text-align: center; }
          .summary-label { font-size: 12px; color: #666; margin-bottom: 5px; }
          .summary-value { font-size: 18px; font-weight: bold; }
          .sent { color: #ef4444; }
          .received { color: #22c55e; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th { background: #70C7BA; color: white; padding: 12px 8px; text-align: left; }
          td { padding: 10px 8px; border-bottom: 1px solid #eee; }
          tr:nth-child(even) { background: #fafafa; }
          .type-sent { color: #ef4444; }
          .type-received { color: #22c55e; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 11px; color: #999; }
          .disclaimer { background: #fff3cd; padding: 15px; border-radius: 8px; margin-top: 20px; font-size: 11px; }
          @media print {
            body { margin: 20px; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">Kaspay</div>
          <div class="subtitle">Transaction Report</div>
        </div>
        
        <div class="summary">
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-label">Report Period</div>
              <div class="summary-value">${dateRange === 'all' ? 'All Time' : dateRange === 'custom' ? `Custom` : `This ${dateRange.charAt(0).toUpperCase() + dateRange.slice(1)}`}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Total Transactions</div>
              <div class="summary-value">${filteredTxs.length}</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Total Sent</div>
              <div class="summary-value sent">-${sentTotal.toFixed(4)} KAS</div>
            </div>
            <div class="summary-item">
              <div class="summary-label">Total Received</div>
              <div class="summary-value received">+${receivedTotal.toFixed(4)} KAS</div>
            </div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Type</th>
              <th>To/From</th>
              <th>Amount</th>
              <th>Currency</th>
              ${includeKasAmounts ? '<th>KAS Amount</th>' : ''}
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${filteredTxs.map(tx => `
              <tr>
                <td>${formatDateTime(tx.timestamp)}</td>
                <td class="${tx.type === 'sent' ? 'type-sent' : 'type-received'}">${tx.type === 'sent' ? '↑ Sent' : '↓ Received'}</td>
                <td>${tx.type === 'sent' ? tx.to : tx.from}</td>
                <td class="${tx.type === 'sent' ? 'type-sent' : 'type-received'}">${tx.type === 'sent' ? '-' : '+'}${tx.amount}</td>
                <td>${tx.currency}</td>
                ${includeKasAmounts ? `<td>${tx.kasAmount}</td>` : ''}
                <td>${tx.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="disclaimer">
          <strong>⚠️ Tax Disclaimer:</strong> This report is provided for informational purposes only and should not be considered tax advice. 
          Please consult with a qualified tax professional regarding your specific tax obligations related to cryptocurrency transactions.
        </div>
        
        <div class="footer">
          Generated on ${new Date().toLocaleString()} • Kaspay Wallet • For tax and record-keeping purposes
        </div>
        
        <script class="no-print">
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;
    
    const blob = new Blob([html], { type: 'text/html' });
    const url = window.URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    
    if (printWindow) {
      printWindow.onafterprint = () => {
        window.URL.revokeObjectURL(url);
      };
    }
  };

  const handleExport = async () => {
    setExporting(true);
    
    // Small delay for UX
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (format === 'csv') {
      exportCSV();
    } else {
      exportPDF();
    }
    
    setExporting(false);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  const filteredCount = getFilteredTransactions().length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 rounded-2xl max-w-lg w-full p-6 shadow-2xl my-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
              <Download className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Export Transactions</h2>
              <p className="text-white/50 text-sm">Download for tax records</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Format Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-white/80 mb-3">Export Format</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setFormat('csv')}
              className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                format === 'csv'
                  ? 'bg-emerald-500/20 border-emerald-500'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <FileSpreadsheet className={`w-8 h-8 ${format === 'csv' ? 'text-emerald-400' : 'text-white/60'}`} />
              <div className="text-center">
                <p className={`font-medium ${format === 'csv' ? 'text-emerald-400' : 'text-white'}`}>CSV</p>
                <p className="text-xs text-white/40">Spreadsheet compatible</p>
              </div>
            </button>
            <button
              onClick={() => setFormat('pdf')}
              className={`p-4 rounded-xl border transition-all flex flex-col items-center gap-2 ${
                format === 'pdf'
                  ? 'bg-emerald-500/20 border-emerald-500'
                  : 'bg-white/5 border-white/10 hover:border-white/20'
              }`}
            >
              <FileText className={`w-8 h-8 ${format === 'pdf' ? 'text-emerald-400' : 'text-white/60'}`} />
              <div className="text-center">
                <p className={`font-medium ${format === 'pdf' ? 'text-emerald-400' : 'text-white'}`}>PDF</p>
                <p className="text-xs text-white/40">Print-ready report</p>
              </div>
            </button>
          </div>
        </div>

        {/* Date Range */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-white/80 mb-3">
            <Calendar className="w-4 h-4 inline mr-2" />
            Date Range
          </label>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="all" className="bg-slate-900">All Time</option>
            <option value="year" className="bg-slate-900">This Year (Tax Year)</option>
            <option value="quarter" className="bg-slate-900">This Quarter</option>
            <option value="month" className="bg-slate-900">This Month</option>
            <option value="custom" className="bg-slate-900">Custom Range</option>
          </select>
          
          {dateRange === 'custom' && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className="block text-xs text-white/50 mb-1">Start Date</label>
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">End Date</label>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Options */}
        <div className="mb-6 space-y-3">
          <label className="block text-sm font-medium text-white/80 mb-2">Include in Export</label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeKasAmounts}
              onChange={() => setIncludeKasAmounts(!includeKasAmounts)}
              className="w-5 h-5 rounded border-white/30 bg-white/10 text-emerald-500 focus:ring-emerald-500"
            />
            <span className="text-white/80">KAS amounts (for crypto tax reporting)</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeTxHash}
              onChange={() => setIncludeTxHash(!includeTxHash)}
              className="w-5 h-5 rounded border-white/30 bg-white/10 text-emerald-500 focus:ring-emerald-500"
            />
            <span className="text-white/80">Transaction hashes (for verification)</span>
          </label>
        </div>

        {/* Summary */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/60">Transactions to export:</span>
            <span className="text-white font-semibold">{filteredCount}</span>
          </div>
        </div>

        {/* Tax Disclaimer */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/80">
              This export is for record-keeping purposes only. Consult a tax professional for advice on cryptocurrency tax obligations in your jurisdiction.
            </p>
          </div>
        </div>

        {/* Export Button */}
        <button
          onClick={handleExport}
          disabled={exporting || filteredCount === 0}
          className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all flex items-center justify-center gap-2"
        >
          {exporting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Exporting...
            </>
          ) : exported ? (
            <>
              <Check className="w-5 h-5" />
              Exported!
            </>
          ) : (
            <>
              <Download className="w-5 h-5" />
              Export {format.toUpperCase()}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
