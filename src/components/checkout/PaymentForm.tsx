'use client';

import { useState } from 'react';
import { CreditCard, Lock, ShieldCheck } from 'lucide-react';

interface PaymentFormProps {
  totalAmount: number;
  onSubmit: (paymentData: PaymentData) => void;
  isLoading?: boolean;
}

export interface PaymentData {
  cardNumber: string;
  cardName: string;
  expiry: string;
  cvv: string;
  installments: number;
}

export default function PaymentForm({ totalAmount, onSubmit, isLoading = false }: PaymentFormProps) {
  const [formData, setFormData] = useState({
    cardNumber: '',
    cardName: '',
    expiry: '',
    cvv: '',
    installments: '1',
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      installments: Number(formData.installments),
    });
  };

  return (
    <div className="bg-[#0B101E] border border-slate-800/60 rounded-xl p-6 w-full font-sans">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-white font-semibold text-sm uppercase tracking-wider flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-amber-500" />
          Pagamento Seguro
        </h3>
        <ShieldCheck className="w-5 h-5 text-emerald-500/80" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Número do Cartão */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5" htmlFor="cardNumber">
            Número do Cartão
          </label>
          <input
            type="text"
            id="cardNumber"
            name="cardNumber"
            maxLength={19}
            placeholder="0000 0000 0000 0000"
            required
            value={formData.cardNumber}
            onChange={handleChange}
            className="w-full bg-[#050810] border border-slate-800/60 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Nome no Cartão */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5" htmlFor="cardName">
            Nome Impresso no Cartão
          </label>
          <input
            type="text"
            id="cardName"
            name="cardName"
            placeholder="MARIA S SILVA"
            required
            value={formData.cardName}
            onChange={handleChange}
            className="w-full bg-[#050810] border border-slate-800/60 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors uppercase"
          />
        </div>

        {/* Validade e CVV */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5" htmlFor="expiry">
              Validade
            </label>
            <input
              type="text"
              id="expiry"
              name="expiry"
              maxLength={5}
              placeholder="MM/AA"
              required
              value={formData.expiry}
              onChange={handleChange}
              className="w-full bg-[#050810] border border-slate-800/60 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5" htmlFor="cvv">
              CVV
            </label>
            <input
              type="text"
              id="cvv"
              name="cvv"
              maxLength={4}
              placeholder="123"
              required
              value={formData.cvv}
              onChange={handleChange}
              className="w-full bg-[#050810] border border-slate-800/60 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        </div>

        {/* Parcelamento */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5" htmlFor="installments">
            Parcelamento
          </label>
          <div className="relative">
            <select
              id="installments"
              name="installments"
              value={formData.installments}
              onChange={handleChange}
              className="w-full bg-[#050810] border border-slate-800/60 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 transition-colors appearance-none cursor-pointer"
            >
              <option value="1">1x de {formatCurrency(totalAmount)} sem juros</option>
              <option value="2">2x de {formatCurrency(totalAmount / 2)} sem juros</option>
              <option value="3">3x de {formatCurrency(totalAmount / 3)} sem juros</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        {/* Botão de Finalizar */}
        <button
          type="submit"
          disabled={isLoading || totalAmount <= 0}
          className="w-full mt-6 bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 disabled:text-slate-400 text-[#050810] font-black uppercase tracking-widest text-xs rounded-lg px-6 py-4 transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4 text-[#050810]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processando...
            </span>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Pagar {formatCurrency(totalAmount)}
            </>
          )}
        </button>
        
        <p className="text-center text-[10px] text-slate-500 mt-4 flex items-center justify-center gap-1.5 uppercase tracking-wider">
          <Lock className="w-3 h-3" /> Seus dados estão criptografados e seguros.
        </p>
      </form>
    </div>
  );
}