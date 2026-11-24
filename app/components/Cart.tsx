'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ShoppingBag, X, Trash2, Plus, Minus, MapPin, Truck } from 'lucide-react';
import { useCartStore } from '@/src/store/cartStore';
import { Montserrat } from 'next/font/google';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '900'],
});

interface ShippingOption {
  id: string;
  name: string;
  price: number;
  days: number;
}

const CART_SHIPPING_STORAGE_KEY = 'tercarium_cart_shipping';

export default function Cart() {
  const { items, removeItem, updateQuantity, isOpen, openCart, closeCart } = useCartStore();
  const [mounted, setMounted] = useState(false);

  // Estados do Motor de Frete
  const [cep, setCep] = useState('');
  const [isCalculating, setIsCalculating] = useState(false);
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[] | null>(null);
  const [selectedOption, setSelectedOption] = useState<ShippingOption | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [isOpen]);

  const formatarTitulo = (category?: string, line?: string, name?: string, subcategory?: string) => {
    const catLower = category ? category.toLowerCase().trim() : '';

    if (catLower.includes('acessorio') || catLower.includes('acessórios')) {
      let subLimpa = subcategory ? subcategory.toLowerCase().trim() : '';

      if (subLimpa === 'cordões' || subLimpa === 'cordoes') subLimpa = 'Cordão';
      else if (subLimpa === 'pulseiras') subLimpa = 'Pulseira';
      else if (subLimpa === 'dezenas') subLimpa = 'Dezena';
      else if (subLimpa) {
        subLimpa = subLimpa.charAt(0).toUpperCase() + subLimpa.slice(1);
      } else {
        subLimpa = 'Cordão';
      }

      const modeloFormatado = name
        ? name.toLowerCase().split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
        : '';

      return [subLimpa, modeloFormatado].filter(Boolean).join(' ');
    }

    const linhaLimpa = line ? line.replace(/linha/gi, '').trim() : '';
    const linhaFormatada = linhaLimpa
      ? linhaLimpa.charAt(0).toUpperCase() + linhaLimpa.slice(1).toLowerCase()
      : '';
    const modeloFormatado = name
      ? name.toLowerCase().split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
      : '';

    return ['Terço', linhaFormatada, modeloFormatado].filter(Boolean).join(' ');
  };

  const persistCartShipping = (rawCep: string, option: ShippingOption) => {
    try {
      sessionStorage.setItem(
        CART_SHIPPING_STORAGE_KEY,
        JSON.stringify({
          cep: rawCep.replace(/\D/g, ''),
          methodId: option.id,
          price: option.price,
        }),
      );
    } catch {
      // Ignora caso o navegador bloqueie sessionStorage
    }
  };

  const handleSelectOption = (option: ShippingOption) => {
    setSelectedOption(option);
    persistCartShipping(cep, option);
  };

  // Máscara para o CEP (00000-000)
  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '').slice(0, 8);
    if (value.length > 5) {
      value = value.replace(/^(\d{5})(\d)/, '$1-$2');
    }
    setCep(value);
  };

  // Simulação do Cálculo de Frete (mesmos IDs usados no Checkout)
  const handleCalculateShipping = () => {
    const cleanCep = cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setIsCalculating(true);
    setShippingOptions(null);
    setSelectedOption(null);

    setTimeout(() => {
      const options: ShippingOption[] = [
        { id: 'J&T Express', name: 'J&T Express', price: 14.9, days: 4 },
        { id: 'Loggi', name: 'Loggi Express', price: 16.5, days: 4 },
        { id: 'Correios SEDEX', name: 'Correios SEDEX', price: 21.9, days: 3 },
      ].sort((a, b) => a.price - b.price);

      setShippingOptions(options);
      if (options[0]) {
        setSelectedOption(options[0]);
        persistCartShipping(cleanCep, options[0]);
      }
      setIsCalculating(false);
    }, 600);
  };

  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = items.reduce(
    (acc, item) => acc + (item.basePrice + (item.extraPrice || 0)) * item.quantity,
    0,
  );

  const frete = selectedOption ? selectedOption.price : 0;
  const total = subtotal + frete;
  const totalPix = subtotal * 0.95 + frete;

  const cartDrawer = mounted
    ? createPortal(
        <div className={montserrat.className}>
          {isOpen && (
            <div
              className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm z-[9998] transition-opacity"
              onClick={closeCart}
            />
          )}

          <div
            className={`fixed top-0 right-0 h-[100dvh] w-full sm:w-[420px] bg-[#050810] border-l border-slate-800/60 flex flex-col transform transition-transform duration-300 z-[9999] shadow-2xl ${
              isOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 bg-[#0B101E] shrink-0">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-5 h-5 text-amber-500" />
                <h2 className="text-sm font-black uppercase tracking-widest text-white">
                  Seu Carrinho
                </h2>
              </div>
              <button
                onClick={closeCart}
                className="text-slate-500 hover:text-amber-500 transition-colors p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* BLOCO 1: APENAS OS ITENS ESCOLHIDOS (ROLÁVEL) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-5">
              {items.length === 0 ? (
                <div className="text-center py-20 space-y-4">
                  <ShoppingBag className="w-10 h-10 text-slate-800 mx-auto" />
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                    O seu carrinho está vazio.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {items.map(item => (
                    <div
                      key={item.id}
                      className="flex gap-3.5 bg-transparent border-b border-slate-800/40 pb-3.5 items-start last:border-b-0 last:pb-0"
                    >
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-14 h-14 rounded-md object-cover border border-slate-800 shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 bg-slate-900/50 rounded-md flex items-center justify-center border border-slate-800 shrink-0">
                          <span className="text-[9px] text-slate-600 font-bold uppercase">
                            Foto
                          </span>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <h4 className="text-xs font-bold text-slate-200 tracking-wide">
                            {formatarTitulo(
                              item.category,
                              item.line,
                              item.name,
                              item.subcategory,
                            )}
                          </h4>
                          <button
                            onClick={() => removeItem(item.id)}
                            className="text-slate-600 hover:text-red-500 transition-colors cursor-pointer shrink-0 mt-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <span className="text-xs text-amber-500 font-black block mt-0.5">
                          R$ {item.basePrice.toFixed(2).replace('.', ',')}
                        </span>
                        {item.observacao && (
                          <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                            Obs: {item.observacao}
                          </p>
                        )}

                        <div className="flex items-center gap-3 mt-2">
                          <div className="flex items-center gap-3 bg-[#0B101E] border border-slate-800/60 rounded px-2 py-0.5">
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className="text-slate-500 hover:text-white cursor-pointer"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-[11px] font-bold text-slate-300 w-4 text-center">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className="text-slate-400 hover:text-white cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* BLOCO 2: FRETE + SUBTOTAL + TOTAL + FINALIZAR (TUDO NO MESMO CARD FIXO) */}
            {items.length > 0 && (
              <div className="p-4 sm:p-5 bg-[#0B101E] border-t border-slate-800/70 shrink-0 max-h-[65dvh] overflow-y-auto custom-scrollbar">
                {/* CÁLCULO DE FRETE INTEGRADO */}
<div className="pb-3.5 mb-3.5 border-b border-slate-800/60">
                  <div className="mb-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-amber-500" /> Simule seu frete
                      </label>
                      {!shippingOptions && (
                        <a
                          href="http://www.buscacep.correios.com.br/sistemas/buscacep/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-slate-500 hover:text-amber-500 underline transition-colors"
                        >
                          Não sei meu CEP
                        </a>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      (Seu frete será confirmado na página de checkout)
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="00000-000"
                      value={cep}
                      onChange={handleCepChange}
                      maxLength={9}
                      className="flex-1 bg-[#050810] border border-slate-800/80 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition-colors text-center font-medium tracking-widest"
                    />
                    <button
                      onClick={handleCalculateShipping}
                      disabled={isCalculating || cep.length < 9}
                      className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/50 disabled:text-slate-500 text-amber-400 text-[11px] font-bold px-4 rounded-lg transition-colors cursor-pointer uppercase tracking-wider min-w-[92px] flex justify-center items-center"
                    >
                      {isCalculating ? (
                        <span className="w-3.5 h-3.5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        'Calcular'
                      )}
                    </button>
                  </div>

                  {/* OPÇÕES EM LINHA ÚNICA COMPACTA */}
                  {shippingOptions && (
                    <div className="mt-2.5 space-y-1.5">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Truck className="w-3 h-3 text-amber-500" /> Escolha a entrega:
                      </p>
                      {shippingOptions.map(option => {
                        const isSelected = selectedOption?.id === option.id;
                        return (
                          <label
                            key={option.id}
                            className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all ${
                              isSelected
                                ? 'border-amber-500 bg-amber-500/10'
                                : 'border-slate-800/80 bg-[#050810] hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="radio"
                                name="shipping_method"
                                className="accent-amber-500 w-3.5 h-3.5 shrink-0"
                                checked={isSelected}
                                onChange={() => handleSelectOption(option)}
                              />
                              <span className="text-[11px] font-bold text-slate-200 truncate">
                                {option.name}
                              </span>
                              <span className="text-[10px] text-slate-500 shrink-0">
                                • {option.days}d úteis
                              </span>
                            </div>
                            <span className="text-[11px] font-black text-amber-400 shrink-0 ml-2">
                              R$ {option.price.toFixed(2).replace('.', ',')}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* RESUMO DE VALORES */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Subtotal:</span>
                    <span className="text-slate-200 font-medium">
                      R$ {subtotal.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">
                      Frete {selectedOption ? `(${selectedOption.name})` : ''}:
                    </span>
                    {frete > 0 ? (
                      <span className="text-slate-200 font-medium">
                        + R$ {frete.toFixed(2).replace('.', ',')}
                      </span>
                    ) : (
                      <span className="text-slate-500 italic">Calcule para ver</span>
                    )}
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t border-slate-800/40 mt-1.5">
                    <span className="text-slate-300 font-bold uppercase tracking-wider">Total:</span>
                    <span className="text-amber-500 font-black text-lg">
                      R$ {total.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <p className="text-right text-[10px] text-emerald-400 font-medium">
                    Ou R$ {totalPix.toFixed(2).replace('.', ',')} no Pix (5% OFF nos produtos)
                  </p>
                </div>

                <Link
                  href="/checkout"
                  onClick={() => {
                    closeCart();
                    document.body.style.overflow = 'auto';
                  }}
                  className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-widest py-3 rounded-lg transition-all shadow-[0_0_15px_rgba(245,158,11,0.15)] flex items-center justify-center gap-2 text-xs cursor-pointer text-center"
                >
                  Finalizar Compra
                </Link>
                <button
                  className="w-full mt-2.5 text-[10px] text-slate-400 hover:text-white uppercase tracking-widest underline cursor-pointer pb-1 block text-center"
                  onClick={closeCart}
                >
                  Ver mais produtos
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className={montserrat.className}>
      <button
        onClick={openCart}
        className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-amber-400 transition-colors cursor-pointer"
      >
        <ShoppingBag className="w-5 h-5 text-amber-500" />
        <span>Carrinho ({totalItems})</span>
      </button>

      {cartDrawer}
    </div>
  );
}