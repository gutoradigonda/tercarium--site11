// app/checkout/page.tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  ShoppingBag,
  Ticket,
  ShieldAlert,
  Lock,
  RefreshCw,
  Info,
  X,
  Truck,
  ExternalLink,
  Check,
  ArrowRight,
  CreditCard,
  QrCode,
  MapPin,
} from 'lucide-react';
import { useCartStore } from '@/src/store/cartStore';
import type { CartItem } from '@/src/store/cartStore';
import { Montserrat } from 'next/font/google';

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '900'],
});

// ============================================================================
// CONFIGURAÇÃO E TIPOS
// ============================================================================

const PIX_DISCOUNT_RATE = 0.05;
const MAX_INSTALLMENTS = 3;
const CHECKOUT_REQUEST_TIMEOUT_MS = 15_000;

const VALID_BRAZILIAN_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

type PaymentMethod = 'pix' | 'credit_card';

type CepLookupStatus =
  | 'idle'
  | 'loading'
  | 'verified'
  | 'not_found'
  | 'manual_fallback';

interface ShippingOption {
  id: string;
  name: string;
  price: number;
  eta: string;
}

const INITIAL_CUSTOMER_STATE = {
  email: '',
  nome: '',
  cpf: '',
  telefone: '',
};

const INITIAL_ADDRESS_STATE = {
  cep: '',
  logradouro: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
};

// ============================================================================
// UTILITÁRIOS DE FORMATAÇÃO E VALIDAÇÃO
// ============================================================================

const normalizeText = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, '');
};

const toFiniteNonNegativeNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const roundCents = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
};

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number.isFinite(value) && value >= 0 ? value : 0);

const maskCPF = (value: string): string =>
  value
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2');

const maskPhone = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}${digits.length > 6 ? `-${digits.slice(6, 10)}` : ''}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

const maskCEP = (value: string): string =>
  value
    .replace(/\D/g, '')
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, '$1-$2');

// Validação matemática oficial dos dígitos verificadores do CPF
const isValidCPF = (cpf: string): boolean => {
  const cleanCPF = cpf.replace(/\D/g, '');
  if (cleanCPF.length !== 11 || /^(\d)\1{10}$/.test(cleanCPF)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(cleanCPF.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit === 10 || digit === 11) digit = 0;
  if (digit !== Number(cleanCPF.charAt(9))) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) {
    sum += Number(cleanCPF.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit === 10 || digit === 11) digit = 0;
  return digit === Number(cleanCPF.charAt(10));
};

// Todas as faixas postais oficiais dos Correios (27 UFs: 01000 a 99999)
const getExpectedUfFromCep = (cleanCep: string): string | null => {
  if (!/^\d{8}$/.test(cleanCep) || /^(\d)\1{7}$/.test(cleanCep)) return null;
  const prefix = Number(cleanCep.slice(0, 5));

  if (prefix >= 1000 && prefix <= 19999) return 'SP';
  if (prefix >= 20000 && prefix <= 28999) return 'RJ';
  if (prefix >= 29000 && prefix <= 29999) return 'ES';
  if (prefix >= 30000 && prefix <= 39999) return 'MG';
  if (prefix >= 40000 && prefix <= 48999) return 'BA';
  if (prefix >= 49000 && prefix <= 49999) return 'SE';
  if (prefix >= 50000 && prefix <= 56999) return 'PE';
  if (prefix >= 57000 && prefix <= 57999) return 'AL';
  if (prefix >= 58000 && prefix <= 58999) return 'PB';
  if (prefix >= 59000 && prefix <= 59999) return 'RN';
  if (prefix >= 60000 && prefix <= 63999) return 'CE';
  if (prefix >= 64000 && prefix <= 64999) return 'PI';
  if (prefix >= 65000 && prefix <= 65999) return 'MA';
  if (prefix >= 66000 && prefix <= 68899) return 'PA';
  if (prefix >= 68900 && prefix <= 68999) return 'AP';
  if (prefix >= 69000 && prefix <= 69299) return 'AM';
  if (prefix >= 69300 && prefix <= 69399) return 'RR';
  if (prefix >= 69400 && prefix <= 69899) return 'AM';
  if (prefix >= 69900 && prefix <= 69999) return 'AC';
  if ((prefix >= 70000 && prefix <= 72799) || (prefix >= 73000 && prefix <= 73699)) return 'DF';
  if ((prefix >= 72800 && prefix <= 72999) || (prefix >= 73700 && prefix <= 76799)) return 'GO';
  if (prefix >= 76800 && prefix <= 76999) return 'RO';
  if (prefix >= 77000 && prefix <= 77999) return 'TO';
  if (prefix >= 78000 && prefix <= 78899) return 'MT';
  if (prefix >= 79000 && prefix <= 79999) return 'MS';
  if (prefix >= 80000 && prefix <= 87999) return 'PR';
  if (prefix >= 88000 && prefix <= 89999) return 'SC';
  if (prefix >= 90000 && prefix <= 99999) return 'RS';

  return null;
};

// Simulação temporária até conectarmos a rota real de frete (Melhor Envio / Frenet)
const computeRegionalShippingOptions = (uf: string): ShippingOption[] => {
  const normalizedUf = uf.trim().toUpperCase();
  const isLocalPR = normalizedUf === 'PR';
  const isSouthOrSoutheast = ['SC', 'RS', 'SP', 'RJ', 'MG', 'ES'].includes(normalizedUf);

  let options: ShippingOption[];
  if (isLocalPR) {
    options = [
      { id: 'J&T Express', name: 'J&T Express', price: 14.9, eta: '2 a 4 dias úteis (+ produção)' },
      { id: 'Loggi', name: 'Loggi Express', price: 16.5, eta: '2 a 4 dias úteis (+ produção)' },
      { id: 'Correios SEDEX', name: 'Correios SEDEX', price: 21.9, eta: '1 a 3 dias úteis (+ produção)' },
    ];
  } else if (isSouthOrSoutheast) {
    options = [
      { id: 'J&T Express', name: 'J&T Express', price: 18.9, eta: '4 a 7 dias úteis (+ produção)' },
      { id: 'Loggi', name: 'Loggi Express', price: 20.9, eta: '4 a 6 dias úteis (+ produção)' },
      { id: 'Correios PAC', name: 'Correios PAC', price: 24.5, eta: '6 a 9 dias úteis (+ produção)' },
    ];
  } else {
    options = [
      { id: 'J&T Express', name: 'J&T Express', price: 26.9, eta: '7 a 12 dias úteis (+ produção)' },
      { id: 'Loggi', name: 'Loggi Express', price: 28.5, eta: '7 a 11 dias úteis (+ produção)' },
      { id: 'Correios PAC', name: 'Correios PAC', price: 32.9, eta: '9 a 14 dias úteis (+ produção)' },
    ];
  }

  return options.sort((a, b) => a.price - b.price);
};

const getItemStockInfo = (item: CartItem) => {
  const parsedStock = toFiniteNonNegativeNumber(item?.estoqueMax);
  const validStock = parsedStock !== null && Number.isSafeInteger(parsedStock);
  const maxStock = validStock ? parsedStock : 0;

  const parsedQuantity = toFiniteNonNegativeNumber(item?.quantity);
  const validQuantity =
    parsedQuantity !== null &&
    Number.isSafeInteger(parsedQuantity) &&
    parsedQuantity >= 1;
  const requestedQty = validQuantity ? parsedQuantity : 0;

  const safeQty =
    validQuantity && validStock && maxStock > 0 && requestedQty <= maxStock
      ? requestedQty
      : 0;

  let availabilityReason:
    | 'available'
    | 'invalid_quantity'
    | 'unknown_stock'
    | 'out_of_stock'
    | 'exceeds_stock';

  if (!validQuantity) availabilityReason = 'invalid_quantity';
  else if (!validStock) availabilityReason = 'unknown_stock';
  else if (maxStock <= 0) availabilityReason = 'out_of_stock';
  else if (requestedQty > maxStock) availabilityReason = 'exceeds_stock';
  else availabilityReason = 'available';

  return {
    safeQty,
    isAvailable: availabilityReason === 'available',
    availabilityReason,
  };
};

const getItemPriceInfo = (item: CartItem) => {
  const basePrice = toFiniteNonNegativeNumber(item?.basePrice);
  const extraPrice =
    item?.extraPrice === undefined || item?.extraPrice === null
      ? 0
      : toFiniteNonNegativeNumber(item.extraPrice);

  return {
    isValid: basePrice !== null && extraPrice !== null,
    basePrice: basePrice ?? 0,
    extraPrice: extraPrice ?? 0,
  };
};

const isSafeHttpsUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function CheckoutPage() {
  const cartStore = useCartStore();
  const { items } = cartStore;

  const [mounted, setMounted] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [customerData, setCustomerData] = useState(INITIAL_CUSTOMER_STATE);
  const [addressData, setAddressData] = useState(INITIAL_ADDRESS_STATE);
  const [noAddressNumber, setNoAddressNumber] = useState(false);
  const [showStep1Errors, setShowStep1Errors] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const [shippingCepStatus, setShippingCepStatus] = useState<CepLookupStatus>('idle');
  const [localShippingMethod, setLocalShippingMethod] = useState<string>('');
  const [localShippingPrice, setLocalShippingPrice] = useState<number | null>(null);
  const [quotedCep, setQuotedCep] = useState<string>('');
  const [quotedUf, setQuotedUf] = useState<string>('');
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);

  const [isLoadingCep, setIsLoadingCep] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [showCouponField, setShowCouponField] = useState(false);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const nomeInputRef = useRef<HTMLInputElement | null>(null);
  const cpfInputRef = useRef<HTMLInputElement | null>(null);
  const telefoneInputRef = useRef<HTMLInputElement | null>(null);
  const numeroInputRef = useRef<HTMLInputElement | null>(null);
  const cepAbortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    setMounted(true);
    return () => {
      isMountedRef.current = false;
      cepAbortControllerRef.current?.abort();
    };
  }, []);

  // ============================================================================
  // VALIDAÇÃO EM TEMPO REAL DA ETAPA 1 (TRAVA PARA LIBERAR A ETAPA 2)
  // ============================================================================

  const cleanCpfDigits = customerData.cpf.replace(/\D/g, '');
  const cleanPhoneDigits = customerData.telefone.replace(/\D/g, '');

  const isEmailValid =
    customerData.email.trim() === '' ||
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerData.email.trim());
  const isNomeValid = customerData.nome.trim().length >= 3;
  const isCpfValid = isValidCPF(customerData.cpf);
  const isTelefoneValid = cleanPhoneDigits.length >= 10 && cleanPhoneDigits.length <= 11;

  const isStep1Complete = isEmailValid && isNomeValid && isCpfValid && isTelefoneValid;

  const emailHasError = !isEmailValid && (showStep1Errors || emailTouched);
  const nomeHasError = !isNomeValid && showStep1Errors;
  const cpfHasError = !isCpfValid && (showStep1Errors || cleanCpfDigits.length === 11);
  const telefoneHasError = !isTelefoneValid && showStep1Errors;

  const handleAttemptLockedStep2 = () => {
    setShowStep1Errors(true);
    setErrorMsg('Preencha os campos obrigatórios destacados na etapa 1 (Contato) para liberar o frete.');
    if (!isEmailValid) {
      emailInputRef.current?.focus();
    } else if (!isNomeValid) {
      nomeInputRef.current?.focus();
    } else if (!isCpfValid) {
      cpfInputRef.current?.focus();
    } else if (!isTelefoneValid) {
      telefoneInputRef.current?.focus();
    }
  };

  // ============================================================================
  // VALIDAÇÃO DE CEP, FRETE E TOTAIS
  // ============================================================================

  const currentCleanShippingCep = addressData.cep.replace(/\D/g, '');
  const currentNormalizedShippingUf = addressData.estado.trim().toUpperCase();
  const expectedShippingUfByPostalRange = getExpectedUfFromCep(currentCleanShippingCep);

  const isShippingDestinationConsistent =
    currentCleanShippingCep.length === 8 &&
    (shippingCepStatus === 'verified' || shippingCepStatus === 'manual_fallback') &&
    VALID_BRAZILIAN_UFS.has(currentNormalizedShippingUf) &&
    expectedShippingUfByPostalRange !== null &&
    expectedShippingUfByPostalRange === currentNormalizedShippingUf;

  const isQuoteBoundToCurrentAddress =
    isShippingDestinationConsistent &&
    quotedCep === currentCleanShippingCep &&
    quotedUf === currentNormalizedShippingUf;

  const parsedShippingPrice = isQuoteBoundToCurrentAddress
    ? toFiniteNonNegativeNumber(localShippingPrice)
    : null;
  const hasValidShippingQuote =
    isQuoteBoundToCurrentAddress &&
    localShippingMethod.trim().length > 0 &&
    parsedShippingPrice !== null;

  const shippingMethod = hasValidShippingQuote ? localShippingMethod.trim() : '';
  const shippingPrice =
    hasValidShippingQuote && parsedShippingPrice !== null ? roundCents(parsedShippingPrice) : 0;

  const hasStockOrQtyConflict = items.some(item => !getItemStockInfo(item).isAvailable);
  const hasPriceConflict = items.some(item => !getItemPriceInfo(item).isValid);
  const hasCartConflict = hasStockOrQtyConflict || hasPriceConflict;

  const subtotal = roundCents(
    items.reduce((sum, item) => {
      const stock = getItemStockInfo(item);
      const price = getItemPriceInfo(item);
      if (!stock.isAvailable || !price.isValid) return sum;
      return sum + roundCents((price.basePrice + price.extraPrice) * stock.safeQty);
    }, 0),
  );

  // Cálculos claros para Cartão (3x sem juros) e PIX (5% OFF nos produtos)
  const totalCartao = roundCents(subtotal + shippingPrice);
  const valorParcela = roundCents(totalCartao / MAX_INSTALLMENTS);
  const valorDescontoPix = roundCents(subtotal * PIX_DISCOUNT_RATE);
  const totalPix = Math.max(0, roundCents(totalCartao - valorDescontoPix));
  const totalExibido = paymentMethod === 'pix' ? totalPix : totalCartao;

  const invalidateCurrentShippingQuote = useCallback(() => {
    setLocalShippingMethod('');
    setLocalShippingPrice(null);
    setQuotedCep('');
    setQuotedUf('');
    setShippingOptions([]);
  }, []);

  const handleSelectShippingOption = useCallback(
    (option: ShippingOption, targetCep?: string, targetUf?: string) => {
      if (isSubmitting || !isStep1Complete) return;
      const cepToBind = targetCep ?? addressData.cep.replace(/\D/g, '');
      const ufToBind = (targetUf ?? addressData.estado).trim().toUpperCase();
      const expectedUf = getExpectedUfFromCep(cepToBind);

      if (cepToBind.length !== 8 || !VALID_BRAZILIAN_UFS.has(ufToBind) || expectedUf !== ufToBind) {
        return;
      }

      setErrorMsg(null);
      setLocalShippingMethod(option.id);
      setLocalShippingPrice(option.price);
      setQuotedCep(cepToBind);
      setQuotedUf(ufToBind);

      const storeRecord = cartStore as unknown as Record<string, unknown>;
      if (typeof storeRecord.setShipping === 'function') {
        try {
          (storeRecord.setShipping as (price: number, method: string) => void)(option.price, option.id);
        } catch {
          // Mantém estado local
        }
      }

      // Foca automaticamente no campo Número assim que a etapa 3 (Endereço) é liberada
      setTimeout(() => {
        if (isMountedRef.current && !noAddressNumber) {
          numeroInputRef.current?.focus();
        }
      }, 100);
    },
    [addressData.cep, addressData.estado, cartStore, isSubmitting, isStep1Complete, noAddressNumber],
  );

  // Sempre seleciona automaticamente a opção mais barata por padrão
  useEffect(() => {
    if (isLoadingCep) return;

    if (!isShippingDestinationConsistent) {
      if (quotedCep !== '' || quotedUf !== '' || shippingOptions.length > 0) {
        invalidateCurrentShippingQuote();
      }
      return;
    }

    if (shippingOptions.length === 0) {
      const options = computeRegionalShippingOptions(currentNormalizedShippingUf);
      setShippingOptions(options);
      if (options[0] && !localShippingMethod) {
        handleSelectShippingOption(options[0], currentCleanShippingCep, currentNormalizedShippingUf);
      }
    }
  }, [
    currentCleanShippingCep,
    currentNormalizedShippingUf,
    handleSelectShippingOption,
    invalidateCurrentShippingQuote,
    isLoadingCep,
    isShippingDestinationConsistent,
    localShippingMethod,
    quotedCep,
    quotedUf,
    shippingOptions.length,
  ]);

  // ============================================================================
  // CONSULTA VIACEP (COM ABORT IMEDIATO E RECUPERAÇÃO LIMPA)
  // ============================================================================

  const fetchAddressByCep = async (cleanCep: string): Promise<void> => {
    if (!/^\d{8}$/.test(cleanCep) || isSubmitting) return;

    if (cepAbortControllerRef.current) {
      cepAbortControllerRef.current.abort();
      cepAbortControllerRef.current = null;
    }
    setIsLoadingCep(false);
    setErrorMsg(null);
    invalidateCurrentShippingQuote();

    const expectedUf = getExpectedUfFromCep(cleanCep);
    if (!expectedUf) {
      setShippingCepStatus('not_found');
      setErrorMsg('O CEP de entrega informado não pertence a uma faixa postal válida.');
      return;
    }

    const controller = new AbortController();
    cepAbortControllerRef.current = controller;
    setIsLoadingCep(true);
    setShippingCepStatus('loading');
    const timeoutId = setTimeout(() => controller.abort(), 5_000);

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`, {
        signal: controller.signal,
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error('Falha ao consultar CEP');

      const data: unknown = await response.json();
      if (!isMountedRef.current || cepAbortControllerRef.current !== controller) return;

      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('Resposta inesperada do ViaCEP');
      }

      const record = data as Record<string, unknown>;
      const returnedCep = typeof record.cep === 'string' ? record.cep.replace(/\D/g, '') : '';
      if (record.erro === true || returnedCep !== cleanCep) {
        setShippingCepStatus('not_found');
        setAddressData(prev => {
          if (prev.cep.replace(/\D/g, '') !== cleanCep) return prev;
          return { ...prev, logradouro: '', bairro: '', cidade: '', estado: '' };
        });
        setErrorMsg('CEP não encontrado na base dos Correios. Confira os 8 dígitos informados.');
        return;
      }

      const logradouro = normalizeText(record.logradouro).trim();
      const bairro = normalizeText(record.bairro).trim();
      const cidade = normalizeText(record.localidade).trim();
      const estado = normalizeText(record.uf).trim().slice(0, 2).toUpperCase();

      if (!VALID_BRAZILIAN_UFS.has(estado) || estado !== expectedUf) {
        setShippingCepStatus('not_found');
        setErrorMsg('Os dados retornados para este CEP são inconsistentes. Verifique o CEP.');
        return;
      }

      setAddressData(prev => {
        if (prev.cep.replace(/\D/g, '') !== cleanCep) return prev;
        return { ...prev, logradouro, bairro, cidade, estado };
      });

      setShippingCepStatus('verified');
      const calculatedOptions = computeRegionalShippingOptions(estado);
      setShippingOptions(calculatedOptions);
      if (calculatedOptions[0]) {
        handleSelectShippingOption(calculatedOptions[0], cleanCep, estado);
      }
    } catch {
      if (isMountedRef.current && cepAbortControllerRef.current === controller) {
        setShippingCepStatus('manual_fallback');
        setAddressData(prev => {
          if (prev.cep.replace(/\D/g, '') !== cleanCep) return prev;
          return { ...prev, estado: expectedUf };
        });
        const fallbackOptions = computeRegionalShippingOptions(expectedUf);
        setShippingOptions(fallbackOptions);
        if (fallbackOptions[0]) {
          handleSelectShippingOption(fallbackOptions[0], cleanCep, expectedUf);
        }
      }
    } finally {
      clearTimeout(timeoutId);
      if (cepAbortControllerRef.current === controller) {
        cepAbortControllerRef.current = null;
        if (isMountedRef.current) setIsLoadingCep(false);
      }
    }
  };

  // ============================================================================
  // HANDLERS DE FORMULÁRIO
  // ============================================================================

  const handleCustomerChange = (
    event: ChangeEvent<HTMLInputElement>,
    field: keyof typeof customerData,
    maskFn?: (value: string) => string,
  ) => {
    if (isSubmitting) return;
    setErrorMsg(null);
    let value = normalizeText(event.target.value);
    if (maskFn) value = maskFn(value);
    setCustomerData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddressChange = (
    event: ChangeEvent<HTMLInputElement>,
    field: keyof typeof addressData,
    maskFn?: (value: string) => string,
  ) => {
    if (isSubmitting) return;
    setErrorMsg(null);
    let value = normalizeText(event.target.value);
    if (maskFn) value = maskFn(value);

    if (field === 'cep') {
      const cleanCep = value.replace(/\D/g, '');
      setAddressData(prev => ({
        ...prev,
        cep: value,
        logradouro: '',
        bairro: '',
        cidade: '',
        estado: '',
      }));
      invalidateCurrentShippingQuote();

      if (cleanCep.length === 8) {
        void fetchAddressByCep(cleanCep);
      } else {
        setShippingCepStatus('idle');
        if (cepAbortControllerRef.current) {
          cepAbortControllerRef.current.abort();
          cepAbortControllerRef.current = null;
          setIsLoadingCep(false);
        }
      }
      return;
    }

    setAddressData(prev => ({ ...prev, [field]: value }));

    if (field === 'estado' && value.trim().toUpperCase() !== quotedUf) {
      invalidateCurrentShippingQuote();
    }
  };

  const handleToggleNoNumber = (checked: boolean) => {
    if (isSubmitting) return;
    setErrorMsg(null);
    setNoAddressNumber(checked);
    setAddressData(prev => ({
      ...prev,
      numero: checked ? 'S/N' : '',
    }));
    if (!checked) {
      setTimeout(() => numeroInputRef.current?.focus(), 50);
    }
  };

  const handleCouponInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (isSubmitting) return;
    const nextValue = normalizeText(event.target.value);
    setCouponInput(nextValue);
    if (appliedCoupon && nextValue.trim().toUpperCase() !== appliedCoupon) {
      setAppliedCoupon(null);
    }
  };

  const handleApplyCoupon = () => {
    if (isSubmitting) return;
    const code = normalizeText(couponInput).trim().toUpperCase();
    if (!code) {
      setAppliedCoupon(null);
      return;
    }
    setCouponInput(code);
    setAppliedCoupon(code);
  };

  const handleRemoveCoupon = () => {
    if (isSubmitting) return;
    setCouponInput('');
    setAppliedCoupon(null);
  };

  // ============================================================================
  // VALIDAÇÃO FINAL E REDIRECIONAMENTO PARA INFINITEPAY
  // ============================================================================

  const validateCheckoutData = (): boolean => {
    if (isLoadingCep) {
      setErrorMsg('Aguarde a conclusão da consulta do CEP antes de continuar.');
      return false;
    }

    if (items.length === 0 || hasStockOrQtyConflict) {
      setErrorMsg('Um ou mais itens possuem quantidade inválida ou estoque indisponível. Revise seu carrinho.');
      return false;
    }

    if (hasPriceConflict) {
      setErrorMsg('Não foi possível validar o preço de um ou mais produtos. Atualize o carrinho.');
      return false;
    }

    if (!isStep1Complete) {
      handleAttemptLockedStep2();
      return false;
    }

    if (
      currentCleanShippingCep.length !== 8 ||
      (shippingCepStatus !== 'verified' && shippingCepStatus !== 'manual_fallback') ||
      !expectedShippingUfByPostalRange
    ) {
      setErrorMsg('Informe um CEP de entrega válido e aguarde a validação.');
      return false;
    }

    if (!hasValidShippingQuote || !isQuoteBoundToCurrentAddress) {
      setErrorMsg('Escolha uma opção de frete na etapa 2 antes de continuar.');
      return false;
    }

    if (!addressData.numero.trim()) {
      setErrorMsg('Informe o número da residência ou marque a opção "Sem número".');
      numeroInputRef.current?.focus();
      return false;
    }

    if (
      !addressData.logradouro.trim() ||
      !addressData.bairro.trim() ||
      !addressData.cidade.trim() ||
      !VALID_BRAZILIAN_UFS.has(currentNormalizedShippingUf)
    ) {
      setErrorMsg('Preencha todos os dados obrigatórios do endereço de entrega.');
      return false;
    }

    if (expectedShippingUfByPostalRange !== currentNormalizedShippingUf) {
      setErrorMsg(
        `O CEP informado pertence ao estado ${expectedShippingUfByPostalRange}, mas a UF foi preenchida como ${currentNormalizedShippingUf}.`,
      );
      return false;
    }

    return true;
  };

  const handleRedirectToInfinitePay = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || isLoadingCep) return;

    setErrorMsg(null);
    if (!validateCheckoutData()) return;

    setIsSubmitting(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CHECKOUT_REQUEST_TIMEOUT_MS);

    try {
      const sanitizedItems = items.map(item => {
        const stock = getItemStockInfo(item);
        return {
          productId: String(item.productId),
          quantity: stock.safeQty,
          extraId: item.extraId ? String(item.extraId) : null,
          observacao: item.observacao
            ? normalizeText(item.observacao).trim().slice(0, 250)
            : null,
        };
      });

      const payload = {
        customer: {
          nome: customerData.nome.trim(),
          email: customerData.email.trim().toLowerCase(),
          cpf: cleanCpfDigits,
          telefone: cleanPhoneDigits,
        },
        address: {
          cep: currentCleanShippingCep,
          logradouro: addressData.logradouro.trim(),
          numero: addressData.numero.trim(),
          complemento: addressData.complemento.trim(),
          bairro: addressData.bairro.trim(),
          cidade: addressData.cidade.trim(),
          estado: currentNormalizedShippingUf,
        },
        shippingMethod,
        shippingQuoteCep: quotedCep,
        shippingQuoteUf: quotedUf,
        shippingClientPrice: shippingPrice,
        couponCode: appliedCoupon,
        paymentMethod: paymentMethod === 'pix' ? 'PIX' : 'CREDIT_CARD',
        clientExpectedTotal: totalExibido,
        items: sanitizedItems,
      };

      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        const serverMsg =
          result && typeof result.error === 'string'
            ? result.error
            : 'Não foi possível gerar o link de pagamento. Confira os dados e tente novamente.';
        setErrorMsg(serverMsg);
        setIsSubmitting(false);
        return;
      }

      const redirectUrl = result?.checkoutUrl || result?.url;
      if (!isSafeHttpsUrl(redirectUrl)) {
        setErrorMsg('Link de pagamento inválido retornado pelo servidor. Tente novamente.');
        setIsSubmitting(false);
        return;
      }

      window.location.href = redirectUrl;
    } catch (error: unknown) {
      if (isMountedRef.current) {
        setErrorMsg(
          error instanceof Error && error.name === 'AbortError'
            ? 'O servidor demorou para responder. Tente novamente em instantes.'
            : 'Falha de conexão ao preparar seu pagamento. Verifique sua internet e tente novamente.',
        );
        setIsSubmitting(false);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // ============================================================================
  // ESTADOS INICIAIS
  // ============================================================================

  if (!mounted) {
    return (
      <div className={`min-h-screen bg-[#050810] flex items-center justify-center ${montserrat.className}`}>
        <div className="flex items-center gap-3 text-sm font-semibold tracking-wider text-amber-400">
          <RefreshCw className="h-5 w-5 animate-spin" />
          Preparando checkout...
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={`min-h-screen bg-[#050810] flex flex-col items-center justify-center px-4 text-center text-slate-300 ${montserrat.className}`}>
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full border border-slate-800/80 bg-[#0B101E]">
          <ShoppingBag className="h-9 w-9 text-amber-500/80" />
        </div>
        <h2 className="mb-2 text-xl font-bold tracking-wide text-white sm:text-2xl">
          Seu carrinho está vazio
        </h2>
        <p className="mb-6 max-w-sm text-sm text-slate-400">
          Escolha seus terços e acessórios artesanais antes de prosseguir para o pagamento.
        </p>
        <a
          href="/"
          className="rounded-xl bg-amber-500 px-6 py-3.5 text-xs font-bold uppercase tracking-widest text-[#050810] transition-colors hover:bg-amber-400"
        >
          Voltar para a loja
        </a>
      </div>
    );
  }

  const submitDisabled =
    isSubmitting || isLoadingCep || hasCartConflict || !isStep1Complete || !hasValidShippingQuote;

  const inputBaseClasses =
    'w-full rounded-xl border border-slate-800/80 bg-[#050810] px-3.5 py-2.5 text-base sm:text-sm text-white placeholder:text-slate-600 transition-all focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';
  const inputErrorClasses =
    'w-full rounded-xl border border-red-500/80 bg-red-950/15 px-3.5 py-2.5 text-base sm:text-sm text-white placeholder:text-slate-500 transition-all focus:border-red-400 focus:ring-2 focus:ring-red-500/20 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';
  const labelBaseClasses = 'mb-1 block text-[11px] font-semibold text-slate-400';

  const destinationLabel = addressData.cidade.trim()
    ? `${addressData.cidade.trim().toUpperCase()}-${currentNormalizedShippingUf}`
    : currentNormalizedShippingUf;

  return (
    <div className={`min-h-screen bg-[#050810] px-4 pt-28 pb-16 text-slate-200 sm:px-6 sm:pt-32 lg:pt-36 ${montserrat.className}`}>
      <div className="mx-auto max-w-[1200px]">
        {/* CABEÇALHO */}
        <header className="mb-8 flex flex-col justify-between gap-4 border-b border-slate-800/60 pb-5 sm:flex-row sm:items-center">
          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            Finalizar Compra
          </h1>

          <div className="flex items-center gap-2 self-start rounded-full border border-emerald-500/20 bg-emerald-950/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-400 sm:self-auto">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>Pagamento seguro via InfinitePay</span>
          </div>
        </header>

        {/* ALERTA DE ERRO */}
        {errorMsg && (
          <div
            role="alert"
            className="mb-6 flex items-start gap-3 rounded-2xl border border-red-500/40 bg-red-950/25 px-4 py-3.5 text-xs font-medium text-red-200 sm:items-center sm:text-sm"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400 sm:mt-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* MALHA DE 2 COLUNAS */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* ================================================================= */}
          {/* COLUNA ESQUERDA — FLUXO VERTICAL (7 COLUNAS)                      */}
          {/* ================================================================= */}
          <form
            onSubmit={handleRedirectToInfinitePay}
            noValidate
            aria-busy={isSubmitting || isLoadingCep}
            className="space-y-6 lg:col-span-7"
          >
            {/* 1. CONTATO */}
            <section className="rounded-2xl border border-slate-800/70 bg-[#0B101E] p-5 shadow-xl shadow-black/25 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                      isStep1Complete
                        ? 'bg-emerald-500 text-[#050810]'
                        : 'bg-amber-500 text-[#050810]'
                    }`}
                  >
                    {isStep1Complete ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : '1'}
                  </span>
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                    Contato
                  </h2>
                </div>
                {isStep1Complete && (
                  <span className="text-[11px] font-semibold text-emerald-400">
                    Dados completos
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor="chk-email" className={labelBaseClasses}>
                    E-mail <span className="font-normal text-slate-500">(Opcional)</span>
                  </label>
                  <input
                    ref={emailInputRef}
                    id="chk-email"
                    type="email"
                    disabled={isSubmitting}
                    autoComplete="email"
                    maxLength={100}
                    placeholder="seu@email.com"
                    value={customerData.email}
                    onChange={e => handleCustomerChange(e, 'email')}
                    onBlur={() => setEmailTouched(true)}
                    className={emailHasError ? inputErrorClasses : inputBaseClasses}
                  />
                  {emailHasError && (
                    <p className="mt-1 text-[11px] font-medium text-red-400">
                      E-mail inválido. Corrija ou deixe em branco.
                    </p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label htmlFor="chk-nome" className={labelBaseClasses}>
                    Nome Completo *
                  </label>
                  <input
                    ref={nomeInputRef}
                    id="chk-nome"
                    type="text"
                    required
                    disabled={isSubmitting}
                    autoComplete="name"
                    maxLength={100}
                    placeholder="Seu nome completo"
                    value={customerData.nome}
                    onChange={e => handleCustomerChange(e, 'nome')}
                    className={nomeHasError ? inputErrorClasses : inputBaseClasses}
                  />
                  {nomeHasError && (
                    <p className="mt-1 text-[11px] font-medium text-red-400">
                      Informe seu nome completo.
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="chk-cpf" className={labelBaseClasses}>
                    CPF *
                  </label>
                  <input
                    ref={cpfInputRef}
                    id="chk-cpf"
                    type="text"
                    required
                    disabled={isSubmitting}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    value={customerData.cpf}
                    onChange={e => handleCustomerChange(e, 'cpf', maskCPF)}
                    maxLength={14}
                    className={cpfHasError ? inputErrorClasses : inputBaseClasses}
                  />
                  {cpfHasError && (
                    <p className="mt-1 text-[11px] font-medium text-red-400">
                      {cleanCpfDigits.length < 11
                        ? 'Informe os 11 dígitos do CPF.'
                        : 'CPF inválido. Verifique os números digitados.'}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="chk-telefone" className={labelBaseClasses}>
                    Telefone / WhatsApp *
                  </label>
                  <input
                    ref={telefoneInputRef}
                    id="chk-telefone"
                    type="tel"
                    required
                    disabled={isSubmitting}
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    value={customerData.telefone}
                    onChange={e => handleCustomerChange(e, 'telefone', maskPhone)}
                    maxLength={15}
                    className={telefoneHasError ? inputErrorClasses : inputBaseClasses}
                  />
                  {telefoneHasError && (
                    <p className="mt-1 text-[11px] font-medium text-red-400">
                      Informe um Telefone / WhatsApp válido com DDD.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* 2. FRETE (LIBERADO APENAS APÓS CONCLUIR A ETAPA 1) */}
            <section
              className={`rounded-2xl border p-5 shadow-xl shadow-black/25 transition-all sm:p-6 ${
                isStep1Complete
                  ? 'border-slate-800/70 bg-[#0B101E]'
                  : 'border-slate-800/40 bg-[#0B101E]/50'
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                      hasValidShippingQuote && isStep1Complete
                        ? 'bg-emerald-500 text-[#050810]'
                        : isStep1Complete
                          ? 'bg-amber-500 text-[#050810]'
                          : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {hasValidShippingQuote && isStep1Complete ? (
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    ) : (
                      '2'
                    )}
                  </span>
                  <h2
                    className={`text-sm font-bold uppercase tracking-wider ${
                      isStep1Complete ? 'text-white' : 'text-slate-500'
                    }`}
                  >
                    Frete
                  </h2>
                </div>
                {isStep1Complete && (
                  <a
                    href="https://buscacepinter.correios.com.br/app/endereco/index.php"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400/90 transition-colors hover:text-amber-300"
                  >
                    Não sei meu CEP <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {!isStep1Complete ? (
                <button
                  type="button"
                  onClick={handleAttemptLockedStep2}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-slate-800 bg-[#050810]/60 p-4 text-left text-xs text-slate-400 transition-colors hover:border-amber-500/40 hover:text-slate-200"
                >
                  <Truck className="h-4 w-4 shrink-0 text-slate-500" />
                  <span>
                    Preencha <strong>Nome Completo, CPF válido e Telefone / WhatsApp</strong> na etapa 1 para liberar o cálculo de frete.
                  </span>
                </button>
              ) : (
                <>
                  <div className="relative">
                    <label htmlFor="chk-cep" className={labelBaseClasses}>
                      CEP *
                    </label>
                    <div className="relative">
                      <input
                        id="chk-cep"
                        type="text"
                        required
                        disabled={isSubmitting}
                        inputMode="numeric"
                        autoComplete="postal-code"
                        placeholder="00000-000"
                        value={addressData.cep}
                        onChange={e => handleAddressChange(e, 'cep', maskCEP)}
                        maxLength={9}
                        className={shippingCepStatus === 'not_found' ? inputErrorClasses : inputBaseClasses}
                      />
                      {isLoadingCep && (
                        <RefreshCw className="absolute right-3.5 top-3 h-4 w-4 animate-spin text-amber-400" />
                      )}
                    </div>
                  </div>

                  {isLoadingCep && (
                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-slate-800/80 bg-[#050810] p-3 text-xs text-amber-400">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
                      <span>Validando CEP e calculando opções de frete...</span>
                    </div>
                  )}

                  {!isLoadingCep && shippingCepStatus === 'not_found' && (
                    <div className="mt-4 rounded-xl border border-red-500/40 bg-red-950/20 p-3 text-xs text-red-300">
                      O CEP informado não foi encontrado. Digite um CEP válido para calcular o frete.
                    </div>
                  )}

                  {!isLoadingCep && isShippingDestinationConsistent && shippingOptions.length > 0 && (
                    <div className="mt-5">
                      <span className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-200">
                        <Truck className="h-3.5 w-3.5 text-amber-400" /> Escolha o frete para {addressData.cep} ({destinationLabel}):
                      </span>
                      <div className="space-y-2">
                        {shippingOptions.map(option => {
                          const isSelected = shippingMethod === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              disabled={isSubmitting}
                              onClick={() =>
                                handleSelectShippingOption(
                                  option,
                                  currentCleanShippingCep,
                                  currentNormalizedShippingUf,
                                )
                              }
                              className={`flex w-full cursor-pointer items-center justify-between rounded-xl border p-3.5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                                isSelected
                                  ? 'border-amber-500 bg-amber-500/10'
                                  : 'border-slate-800/80 bg-[#050810] hover:border-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <span
                                  className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                                    isSelected
                                      ? 'border-amber-400 bg-amber-400 text-[#050810]'
                                      : 'border-slate-600'
                                  }`}
                                >
                                  {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                                </span>
                                <div>
                                  <p className="text-xs font-bold text-white">{option.name}</p>
                                  <p className="text-[11px] text-slate-400">{option.eta}</p>
                                </div>
                              </div>
                              <span className="text-xs font-extrabold text-amber-400">
                                {formatCurrency(option.price)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>

            {/* 3. ENDEREÇO DE ENTREGA (LIBERADO APENAS APÓS ESCOLHER O FRETE) */}
            <section
              className={`rounded-2xl border p-5 shadow-xl shadow-black/25 transition-all sm:p-6 ${
                hasValidShippingQuote && isStep1Complete
                  ? 'border-slate-800/70 bg-[#0B101E]'
                  : 'border-slate-800/40 bg-[#0B101E]/50'
              }`}
            >
              <div className="mb-4 flex items-center gap-2.5">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-black ${
                    hasValidShippingQuote && isStep1Complete
                      ? 'bg-amber-500 text-[#050810]'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  3
                </span>
                <h2
                  className={`text-sm font-bold uppercase tracking-wider ${
                    hasValidShippingQuote && isStep1Complete ? 'text-white' : 'text-slate-500'
                  }`}
                >
                  Endereço de Entrega
                </h2>
              </div>

              {!hasValidShippingQuote || !isStep1Complete ? (
                <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-slate-800 bg-[#050810]/60 p-4 text-xs text-slate-500">
                  <MapPin className="h-4 w-4 shrink-0 text-slate-600" />
                  <span>Informe seu CEP e escolha uma opção de frete na etapa 2 para liberar o endereço de entrega.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {shippingCepStatus === 'manual_fallback' && (
                    <div
                      role="status"
                      className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200"
                    >
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                      <span>
                        Não foi possível consultar seu CEP automaticamente. Preencha e confira os dados do endereço abaixo.
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-12 gap-3.5">
                    {/* Linha 1: Rua / Avenida */}
                    <div className="col-span-12">
                      <label htmlFor="chk-logradouro" className={labelBaseClasses}>
                        Rua / Avenida *
                      </label>
                      <input
                        id="chk-logradouro"
                        type="text"
                        required
                        disabled={isSubmitting}
                        autoComplete="street-address"
                        maxLength={120}
                        placeholder="Rua ou avenida"
                        value={addressData.logradouro}
                        onChange={e => handleAddressChange(e, 'logradouro')}
                        className={inputBaseClasses}
                      />
                    </div>

                    {/* Linha 2: Número e Complemento */}
                    <div className="col-span-12 sm:col-span-5">
                      <div className="mb-1 flex items-center justify-between">
                        <label htmlFor="chk-numero" className="text-[11px] font-semibold text-slate-400">
                          Número *
                        </label>
                        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-200">
                          <input
                            type="checkbox"
                            disabled={isSubmitting}
                            checked={noAddressNumber}
                            onChange={e => handleToggleNoNumber(e.target.checked)}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-slate-700 bg-slate-900 accent-amber-500"
                          />
                          <span>Sem número</span>
                        </label>
                      </div>
                      <input
                        ref={numeroInputRef}
                        id="chk-numero"
                        type="text"
                        required
                        disabled={isSubmitting || noAddressNumber}
                        autoComplete="address-line1"
                        maxLength={20}
                        placeholder="Nº"
                        value={addressData.numero}
                        onChange={e => handleAddressChange(e, 'numero')}
                        className={inputBaseClasses}
                      />
                    </div>

                    <div className="col-span-12 sm:col-span-7">
                      <label htmlFor="chk-complemento" className={labelBaseClasses}>
                        Complemento <span className="font-normal text-slate-500">(Opcional)</span>
                      </label>
                      <input
                        id="chk-complemento"
                        type="text"
                        disabled={isSubmitting}
                        autoComplete="address-line2"
                        maxLength={80}
                        placeholder="Apto, bloco, casa, referência"
                        value={addressData.complemento}
                        onChange={e => handleAddressChange(e, 'complemento')}
                        className={inputBaseClasses}
                      />
                    </div>

                    {/* Linha 3: Bairro, Cidade e UF */}
                    <div className="col-span-12 sm:col-span-5">
                      <label htmlFor="chk-bairro" className={labelBaseClasses}>
                        Bairro *
                      </label>
                      <input
                        id="chk-bairro"
                        type="text"
                        required
                        disabled={isSubmitting}
                        autoComplete="address-level3"
                        maxLength={80}
                        placeholder="Bairro"
                        value={addressData.bairro}
                        onChange={e => handleAddressChange(e, 'bairro')}
                        className={inputBaseClasses}
                      />
                    </div>

                    <div className="col-span-8 sm:col-span-5">
                      <label htmlFor="chk-cidade" className={labelBaseClasses}>
                        Cidade *
                      </label>
                      <input
                        id="chk-cidade"
                        type="text"
                        required
                        disabled={isSubmitting}
                        autoComplete="address-level2"
                        maxLength={80}
                        placeholder="Cidade"
                        value={addressData.cidade}
                        onChange={e => handleAddressChange(e, 'cidade')}
                        className={inputBaseClasses}
                      />
                    </div>

                    <div className="col-span-4 sm:col-span-2">
                      <label htmlFor="chk-uf" className={labelBaseClasses}>
                        UF *
                      </label>
                      <input
                        id="chk-uf"
                        type="text"
                        required
                        disabled={isSubmitting}
                        autoComplete="address-level1"
                        placeholder="PR"
                        maxLength={2}
                        value={addressData.estado}
                        onChange={e => handleAddressChange(e, 'estado')}
                        className={`${inputBaseClasses} px-1 text-center uppercase`}
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* 4. PAGAMENTO (ESCOLHA PIX 5% OFF OU CARTÃO 3X SEM JUROS -> INFINITEPAY) */}
            <section className="rounded-2xl border border-slate-800/70 bg-[#0B101E] p-5 shadow-xl shadow-black/25 sm:p-6">
              <div className="mb-5 flex items-center gap-2.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-[#050810]">
                  4
                </span>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                  Forma de Pagamento
                </h2>
              </div>

              <div
                className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2"
                role="group"
                aria-label="Escolha a forma de pagamento"
              >
                {/* OPÇÃO PIX */}
                <button
                  type="button"
                  disabled={isSubmitting}
                  aria-pressed={paymentMethod === 'pix'}
                  onClick={() => setPaymentMethod('pix')}
                  className={`relative flex cursor-pointer flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                    paymentMethod === 'pix'
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : 'border-slate-800/80 bg-[#050810] hover:border-slate-700'
                  }`}
                >
                  <span className="absolute -top-2.5 right-3 rounded-full bg-emerald-500 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-[#050810]">
                    5% OFF
                  </span>
                  <div className="flex items-center gap-2 text-emerald-400">
                    <QrCode className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">PIX à Vista</span>
                  </div>
                  <p className="mt-1 text-lg font-black text-white">
                    {formatCurrency(totalPix)}
                  </p>
                  <p className="text-[11px] text-emerald-400/90">
                    Economia de {formatCurrency(valorDescontoPix)} (5% nos produtos)
                  </p>
                </button>

                {/* OPÇÃO CARTÃO */}
                <button
                  type="button"
                  disabled={isSubmitting}
                  aria-pressed={paymentMethod === 'credit_card'}
                  onClick={() => setPaymentMethod('credit_card')}
                  className={`flex cursor-pointer flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
                    paymentMethod === 'credit_card'
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-slate-800/80 bg-[#050810] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 text-amber-400">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Cartão de Crédito</span>
                  </div>
                  <p className="mt-1 text-lg font-black text-white">
                    {MAX_INSTALLMENTS}x de {formatCurrency(valorParcela)}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Sem juros • Total {formatCurrency(totalCartao)}
                  </p>
                </button>
              </div>

              <div className="mb-5 rounded-xl border border-slate-800/80 bg-[#050810] p-3.5 text-xs leading-relaxed text-slate-400">
                Ao clicar em pagar, você será direcionado ao ambiente oficial e criptografado da{' '}
                <strong className="text-slate-200">InfinitePay</strong> para concluir o pagamento com segurança.
              </div>

              <button
                type="submit"
                disabled={submitDisabled}
                className={`flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl px-6 py-4 text-sm font-black uppercase tracking-wider text-[#050810] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  paymentMethod === 'pix'
                    ? 'bg-emerald-500 hover:bg-emerald-400'
                    : 'bg-amber-500 hover:bg-amber-400'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Conectando à InfinitePay...
                  </>
                ) : isLoadingCep ? (
                  'Calculando frete...'
                ) : !isStep1Complete ? (
                  'Preencha seus dados na etapa 1'
                ) : !hasValidShippingQuote ? (
                  'Escolha o frete na etapa 2'
                ) : (
                  <>
                    <span>
                      Pagar {formatCurrency(totalExibido)}{' '}
                      {paymentMethod === 'pix' ? 'no PIX' : 'no Cartão'}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </section>
          </form>

          {/* ================================================================= */}
          {/* COLUNA DIREITA — RESUMO DO PEDIDO FIXO (5 COLUNAS)                */}
          {/* ================================================================= */}
          <div className="lg:col-span-5">
            <section className="sticky top-28 rounded-2xl border border-slate-800/70 bg-[#0B101E] p-5 shadow-xl shadow-black/25 sm:p-6">
              <div className="mb-4 flex items-center justify-between border-b border-slate-800/60 pb-3.5">
                <div className="flex items-center gap-2.5">
                  <ShoppingBag className="h-4 w-4 text-amber-400" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                    Resumo do Pedido
                  </h2>
                </div>
                <span className="rounded-full bg-slate-800/80 px-2.5 py-0.5 text-[11px] font-semibold text-slate-300">
                  {items.length} {items.length === 1 ? 'item' : 'itens'}
                </span>
              </div>

              {/* LISTA DE ITENS */}
              <div className="mb-4 max-h-[300px] space-y-3 overflow-y-auto border-b border-slate-800/60 pb-4 pr-1">
                {items.map(item => {
                  const stock = getItemStockInfo(item);
                  const price = getItemPriceInfo(item);
                  const itemTotal =
                    stock.isAvailable && price.isValid
                      ? roundCents((price.basePrice + price.extraPrice) * stock.safeQty)
                      : 0;

                  const availabilityLabel: Record<string, string> = {
                    invalid_quantity: 'Quantidade inválida',
                    unknown_stock: 'Estoque não informado',
                    out_of_stock: 'Estoque esgotado',
                    exceeds_stock: 'Quantidade acima do estoque',
                    available: 'Disponível',
                  };

                  const showImage = Boolean(item.imageUrl) && !brokenImages[item.id];

                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3.5 rounded-xl border border-slate-800/50 bg-[#050810]/60 p-3"
                    >
                      {showImage ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          loading="lazy"
                          decoding="async"
                          onError={() => setBrokenImages(prev => ({ ...prev, [item.id]: true }))}
                          className="h-14 w-14 shrink-0 rounded-lg border border-slate-800 object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/70">
                          <ShoppingBag className="h-5 w-5 text-slate-600" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <h4 className="truncate text-xs font-bold text-slate-100 sm:text-sm">
                          {item.name}
                        </h4>
                        {stock.isAvailable && price.isValid ? (
                          <p className="mt-0.5 text-xs text-slate-400">
                            Qtd: <span className="font-semibold text-slate-200">{stock.safeQty}</span>
                          </p>
                        ) : (
                          <p className="mt-0.5 text-xs font-semibold text-red-400">
                            {!price.isValid ? 'Preço inválido' : availabilityLabel[stock.availabilityReason]}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-xs font-bold text-amber-400 sm:text-sm">
                          {formatCurrency(itemTotal)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* CUPOM RETRÁTIL */}
              <div className="mb-4 border-b border-slate-800/60 pb-4">
                {!showCouponField && !appliedCoupon ? (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setShowCouponField(true)}
                    className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-amber-400/90 transition-colors hover:text-amber-300"
                  >
                    <Ticket className="h-3.5 w-3.5" /> Possui um cupom promocional?
                  </button>
                ) : (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label htmlFor="chk-cupom" className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                        <Ticket className="h-3.5 w-3.5 text-amber-400" /> Cupom Promocional
                      </label>
                      {!appliedCoupon && (
                        <button
                          type="button"
                          onClick={() => setShowCouponField(false)}
                          className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-300"
                        >
                          Ocultar
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        id="chk-cupom"
                        type="text"
                        disabled={isSubmitting}
                        autoComplete="off"
                        maxLength={30}
                        placeholder="DIGITE O CÓDIGO"
                        value={couponInput}
                        onChange={handleCouponInputChange}
                        className="min-w-0 flex-1 rounded-xl border border-slate-800/80 bg-[#050810] px-3.5 py-2 text-base sm:text-xs uppercase text-white placeholder:text-slate-600 transition-colors focus:border-amber-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <button
                        type="button"
                        disabled={isSubmitting || !couponInput.trim()}
                        onClick={handleApplyCoupon}
                        className="cursor-pointer rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-amber-400 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Anexar
                      </button>
                    </div>

                    {appliedCoupon && (
                      <div className="mt-2.5 flex items-start justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs text-amber-200">
                        <div className="flex items-start gap-2">
                          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                          <div>
                            <span className="font-bold text-amber-300">Código {appliedCoupon} anexado.</span>
                            <p className="mt-0.5 text-[11px] text-slate-300">
                              O desconto será validado e abatido antes de gerar o link da InfinitePay.
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={handleRemoveCoupon}
                          aria-label="Remover cupom anexado"
                          className="shrink-0 cursor-pointer rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* TOTAIS E COMPARATIVO CLARO (PIX 5% OFF VS 3X SEM JUROS) */}
              <div className="space-y-2.5 text-xs sm:text-sm">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal dos produtos</span>
                  <span className="font-semibold text-slate-200">{formatCurrency(subtotal)}</span>
                </div>

                <div className="flex justify-between text-slate-400">
                  <span>Frete {hasValidShippingQuote ? `(${shippingMethod})` : ''}</span>
                  {isLoadingCep ? (
                    <span className="text-xs font-medium text-amber-400">Calculando...</span>
                  ) : hasValidShippingQuote ? (
                    <span className="font-semibold text-slate-200">{formatCurrency(shippingPrice)}</span>
                  ) : (
                    <span className="text-xs font-medium text-amber-400">Escolha na etapa 2</span>
                  )}
                </div>

                {paymentMethod === 'pix' && (
                  <div className="flex justify-between font-semibold text-emerald-400">
                    <span>Desconto PIX (5% nos produtos)</span>
                    <span>- {formatCurrency(valorDescontoPix)}</span>
                  </div>
                )}

                <div className="mt-4 border-t border-slate-800/80 pt-4">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-sm font-bold uppercase tracking-wider text-white">
                        {appliedCoupon ? 'Total (pré-cupom)' : 'Total'}
                      </span>
                      <span className="block text-[11px] text-slate-400">
                        {paymentMethod === 'pix'
                          ? 'À vista no PIX (5% OFF)'
                          : `Em até ${MAX_INSTALLMENTS}x de ${formatCurrency(valorParcela)} sem juros`}
                      </span>
                    </div>
                    <span
                      className={`text-2xl font-black tracking-tight ${
                        paymentMethod === 'pix' ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {formatCurrency(totalExibido)}
                    </span>
                  </div>

                  {/* QUADRO COMPARATIVO DAS DUAS OPÇÕES */}
                  <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-slate-800/80 bg-[#050810] p-3 text-[11px]">
                    <div
                      className={`rounded-lg p-2 transition-colors ${
                        paymentMethod === 'pix'
                          ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40'
                          : 'opacity-80'
                      }`}
                    >
                      <span className="block font-bold text-emerald-400">No PIX (5% OFF)</span>
                      <span className="mt-0.5 block text-sm font-black text-white">
                        {formatCurrency(totalPix)}
                      </span>
                    </div>

                    <div
                      className={`rounded-lg p-2 transition-colors ${
                        paymentMethod === 'credit_card'
                          ? 'bg-amber-500/10 ring-1 ring-amber-500/40'
                          : 'opacity-80'
                      }`}
                    >
                      <span className="block font-bold text-amber-400">No Cartão</span>
                      <span className="mt-0.5 block text-sm font-black text-white">
                        {MAX_INSTALLMENTS}x {formatCurrency(valorParcela)}
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        sem juros ({formatCurrency(totalCartao)})
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}