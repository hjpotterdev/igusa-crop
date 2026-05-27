import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Upload, 
  Trash2, 
  Download, 
  RefreshCw, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  RotateCcw, 
  Moon, 
  Sun, 
  FileText, 
  Info, 
  Check, 
  AlertCircle,
  HelpCircle,
  Sliders,
  ChevronRight,
  Sparkles,
  X,
  PackageOpen
} from 'lucide-react';
import JSZip from 'jszip';

// ==========================================
// 0. 토스트 타입 정의
// ==========================================
interface Toast {
  id: string;
  message: string;
  type: 'error' | 'warning' | 'success' | 'info';
}

// ==========================================
// 1. 타입 정의 (Types & Interfaces)
// ==========================================

// 업로드된 이미지 항목 상태 관리
interface ImageItem {
  id: string;
  file: File;
  name: string;
  size: number;
  originalUrl: string;       // 원본 뷰용 Blob URL
  croppedUrl: string | null;  // 크랍 연산 완료 후 생성된 Blob URL
  width: number;
  height: number;
  croppedWidth: number | null;
  croppedHeight: number | null;
  // Canvas 상에서 감지된 투명하지 않은 픽셀들의 바운딩 박스
  cropBox: { top: number; bottom: number; left: number; right: number; width: number; height: number } | null;
  // 사용자가 임의 지정할 수 있는 상하좌우 패딩 (px)
  padding: { top: number; bottom: number; left: number; right: number };
  status: 'idle' | 'processing' | 'done' | 'error';
  errorMessage: string | null;
  noMargin: boolean;         // 여백이 아예 없는지 여부
  // 원본 대비 깎여 나간 픽셀 두께 정보
  cropDetails: { topRemoved: number; bottomRemoved: number; leftRemoved: number; rightRemoved: number } | null;
}

// 터미널 스타일 로그 항목
interface LogItem {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

export default function App() {
  // ==========================================
  // 2. 상태 관리 (State Management)
  // ==========================================
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'before' | 'after'>('before');
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true); // 기본 다크모드 적용 (프리미엄 룩)
  
  // 패딩 제어 변수 (일괄 변경 or 개별 변경용 임시 상태 - 기본 사방 5px 자동 여백 정리)
  const [paddingAll, setPaddingAll] = useState<number>(5);
  const [paddingIndividual, setPaddingIndividual] = useState<{ top: number; bottom: number; left: number; right: number }>({
    top: 5, bottom: 5, left: 5, right: 5
  });
  const [useIndividualPadding, setUseIndividualPadding] = useState<boolean>(false);

  // 줌 & 팬 상태
  const [scale, setScale] = useState<number>(1); // 10% (0.1) ~ 500% (5.0)
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 로딩 및 진척도 상태
  const [globalProcessing, setGlobalProcessing] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(0);

  // 가이드 모달 팝업 상태 및 활성 탭 상태
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);
  const [guideActiveTab, setGuideActiveTab] = useState<'miri' | 'mango' | 'security'>('miri');

  // 드래그 오버 시각 피드백 상태 (드롭존 하이라이트용)
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // 인라인 토스트 알림 시스템 (alert() 대체 - 비차단 UX)
  const [toasts, setToasts] = useState<Toast[]>([]);

  // 여백 감지 모드: 'auto'=코너 샘플링 자동 감지(기본), 'transparent'=투명도 감지, 'white'=흰색 고정 감지
  const [bgDetectionMode, setBgDetectionMode] = useState<'auto' | 'transparent' | 'white'>('auto');
  // 배경색 허용 오차 (색상 거리 기준, 낮을수록 엄격 / 기본 30은 대부분 단색 배경에 적합)
  const [bgTolerance, setBgTolerance] = useState<number>(30);
  // 고급 수동 설정 (여백 오차율 및 수동 패딩 조절) 펼침 여부 상태 (기본: 접힘)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);

  // DOM Refs
  const logContainerRef = useRef<HTMLDivElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==========================================
  // 3. 로그 유틸리티 함수 (Log Utilities)
  // ==========================================
  const addLog = useCallback((message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') => {
    const now = new Date();
    const timestamp = now.toTimeString().split(' ')[0]; // HH:MM:SS
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(2, 9),
      timestamp,
      message,
      type
    }]);
  }, []);

  // 토스트 알림 표시 함수 (자동으로 3.5초 후 사라짐)
  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    // 3.5초 후 자동 제거
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  // 토스트 수동 닫기
  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // 로그 추가 시 터미널창 자동 스크롤 하단 이동
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // 첫 마운트 시 웰컴 로그
  useEffect(() => {
    addLog("시스템 준비 완료. PNG 이미지를 업로드하면 즉시 사방 5px 여백 정리가 자동으로 실행됩니다.", "info");
  }, [addLog]);

  // 최상위 HTML 엘리먼트 다크모드 클래스 바인딩
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDarkMode]);

  // ==========================================
  // 4. 핵심 알고리즘: 배경 자동 감지 및 크랍 처리
  // ==========================================

  /**
   * 이미지 4개 모서리에서 배경색을 자동 샘플링하는 함수.
   * 모서리 픽셀들의 평균 RGB를 배경색으로 사용.
   * 투명 영역(alpha=0)이 많으면 투명 모드가 더 적합함을 함께 반환.
   */
  const sampleBackgroundColor = (
    data: Uint8ClampedArray,
    width: number,
    height: number
  ): { r: number; g: number; b: number; isTransparentBg: boolean } => {
    // 모서리 4곳 + 각 모서리 인근 몇 픽셀씩 샘플링
    const samplePoints = [
      [0, 0], [1, 0], [0, 1], [1, 1],                          // 좌상단
      [width - 1, 0], [width - 2, 0], [width - 1, 1],          // 우상단
      [0, height - 1], [0, height - 2], [1, height - 1],        // 좌하단
      [width - 1, height - 1], [width - 2, height - 1],         // 우하단
    ];

    let totalR = 0, totalG = 0, totalB = 0;
    let transparentCount = 0;
    let validCount = 0;

    for (const [sx, sy] of samplePoints) {
      const idx = (sy * width + sx) * 4;
      const alpha = data[idx + 3];
      if (alpha < 10) {
        transparentCount++;
      } else {
        totalR += data[idx];
        totalG += data[idx + 1];
        totalB += data[idx + 2];
        validCount++;
      }
    }

    // 모서리의 절반 이상이 투명이면 투명 배경 이미지
    const isTransparentBg = transparentCount > samplePoints.length / 2;

    if (validCount === 0) {
      return { r: 255, g: 255, b: 255, isTransparentBg: true };
    }

    return {
      r: Math.round(totalR / validCount),
      g: Math.round(totalG / validCount),
      b: Math.round(totalB / validCount),
      isTransparentBg,
    };
  };

  /**
   * 두 RGB 색상 간의 유클리드 거리 계산.
   * 값이 낮을수록 비슷한 색상.
   */
  const colorDistance = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number => {
    return Math.sqrt(
      (r1 - r2) ** 2 +
      (g1 - g2) ** 2 +
      (b1 - b2) ** 2
    );
  };

  /**
   * 이미지에서 오브젝트의 바운딩 박스를 감지하는 함수.
   * - 'auto' 모드: 모서리 색상을 샘플링해 배경색 자동 판별 (크림색, 흰색, 회색 등 모든 단색 배경 지원)
   * - 'transparent' 모드: 알파 채널 기반 투명 픽셀만 배경으로 처리
   * - 'white' 모드: 흰색 계열 고정 감지
   */
  const getOpaqueBoundingBox = (
    imageData: ImageData,
    mode: 'auto' | 'transparent' | 'white',
    tolerance: number
  ): { top: number; bottom: number; left: number; right: number; width: number; height: number } | null => {
    const { data, width, height } = imageData;
    let top = height, bottom = -1, left = width, right = -1;

    // auto 모드: 모서리 샘플링으로 배경색 자동 감지
    let bgR = 255, bgG = 255, bgB = 255;
    let useColorDistance = false;

    if (mode === 'auto') {
      const sampled = sampleBackgroundColor(data, width, height);
      if (sampled.isTransparentBg) {
        // 투명 배경 이미지면 투명도 기반으로 처리
        useColorDistance = false;
      } else {
        // 단색 배경이면 샘플링된 배경색과 색상 거리로 비교
        bgR = sampled.r;
        bgG = sampled.g;
        bgB = sampled.b;
        useColorDistance = true;
      }
    } else if (mode === 'white') {
      bgR = 255; bgG = 255; bgB = 255;
      useColorDistance = true;
    }

    // tolerance를 색상 거리(0~441 범위)로 변환 (슬라이더 0~100 -> 실제 거리 0~80)
    const distanceThreshold = tolerance * 0.8;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const alpha = data[index + 3];

        let isTarget = false;

        if (mode === 'transparent') {
          // 투명도 기반 감지: alpha > 0 인 픽셀이 오브젝트
          isTarget = alpha > 0;
        } else if (useColorDistance) {
          // 색상 거리 기반 감지: 배경색과 충분히 다른 픽셀이 오브젝트
          if (alpha < 10) {
            isTarget = false; // 완전 투명은 제외
          } else {
            const dist = colorDistance(r, g, b, bgR, bgG, bgB);
            isTarget = dist > distanceThreshold;
          }
        } else {
          // auto이지만 투명 배경으로 감지된 경우
          isTarget = alpha > 0;
        }

        if (isTarget) {
          if (y < top) top = y;
          if (y > bottom) bottom = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }

    if (bottom === -1 || right === -1) {
      return null;
    }

    return {
      top,
      bottom,
      left,
      right,
      width: right - left + 1,
      height: bottom - top + 1
    };
  };

  // 실제로 이미지를 Canvas 상에서 자르고 패딩(음수 패딩 포함)을 부가하여 결과 Blob URL을 생성하는 함수
  const processImageCrop = useCallback((
    item: ImageItem, 
    currentPadding: typeof item.padding,
    mode: 'auto' | 'transparent' | 'white' = bgDetectionMode,
    tolerance: number = bgTolerance
  ): Promise<ImageItem> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = item.originalUrl;
      img.crossOrigin = "anonymous"; // 클라이언트단 CORS 안전장치
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({
            ...item,
            status: 'error',
            errorMessage: 'Canvas 컨텍스트를 획득하지 못했습니다.'
          });
          return;
        }

        const width = img.naturalWidth;
        const height = img.naturalHeight;
        
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0);

        try {
          const imageData = ctx.getImageData(0, 0, width, height);
          const box = getOpaqueBoundingBox(imageData, mode, tolerance);

          if (!box) {
            resolve({
              ...item,
              status: 'error',
              errorMessage: '감지할 수 있는 개체가 존재하지 않거나 빈 흰색/투명 이미지입니다.'
            });
            return;
          }

          // 제거된 여백 픽셀 수 계산
          const topRemoved = box.top;
          const bottomRemoved = height - 1 - box.bottom;
          const leftRemoved = box.left;
          const rightRemoved = width - 1 - box.right;

          const noMargin = topRemoved === 0 && bottomRemoved === 0 && leftRemoved === 0 && rightRemoved === 0;

          // 이너 크롭(음수 패딩) 및 아우터 패딩 동시 정밀 연산
          // 음수 패딩 적용 시 소스(박스) 영역에서 해당 크기만큼 깎아냄
          const srcLeft = box.left + (currentPadding.left < 0 ? -currentPadding.left : 0);
          const srcTop = box.top + (currentPadding.top < 0 ? -currentPadding.top : 0);
          
          // 최소 1px 크기 보증
          const srcWidth = Math.max(1, box.width - (currentPadding.left < 0 ? -currentPadding.left : 0) - (currentPadding.right < 0 ? -currentPadding.right : 0));
          const srcHeight = Math.max(1, box.height - (currentPadding.top < 0 ? -currentPadding.top : 0) - (currentPadding.bottom < 0 ? -currentPadding.bottom : 0));

          // 최종 생성할 캔버스 크기 계산 (음수 패딩을 반영하되 최소 1px 이상 보증)
          const croppedWidth = Math.max(1, box.width + currentPadding.left + currentPadding.right);
          const croppedHeight = Math.max(1, box.height + currentPadding.top + currentPadding.bottom);

          const outputCanvas = document.createElement('canvas');
          outputCanvas.width = croppedWidth;
          outputCanvas.height = croppedHeight;
          const outCtx = outputCanvas.getContext('2d');

          if (!outCtx) {
            resolve({
              ...item,
              status: 'error',
              errorMessage: '출력 Canvas 생성을 실패했습니다.'
            });
            return;
          }

          // 출력 Canvas 배경 초기화 (투명 유지)
          outCtx.clearRect(0, 0, croppedWidth, croppedHeight);
          
          // 목적지 캔버스에서의 포지션 결정 (양수 패딩만 해당 공간에 배치하고, 음수일 경우 0에 드로잉)
          const destLeft = currentPadding.left > 0 ? currentPadding.left : 0;
          const destTop = currentPadding.top > 0 ? currentPadding.top : 0;

          // 원본 이미지의 Bounding Box 영역을 새 크랍 Canvas의 패딩 위치에 드로잉
          outCtx.drawImage(
            img, 
            srcLeft, srcTop, srcWidth, srcHeight, // Source X, Y, W, H
            destLeft, destTop, srcWidth, srcHeight // Destination X, Y, W, H
          );

          // DataURL 형태로 Blob을 브라우저 메모리에 저장
          const croppedUrl = outputCanvas.toDataURL('image/png');

          resolve({
            ...item,
            croppedUrl,
            croppedWidth,
            croppedHeight,
            cropBox: box,
            padding: currentPadding,
            status: 'done',
            noMargin,
            cropDetails: { topRemoved, bottomRemoved, leftRemoved, rightRemoved },
            errorMessage: null
          });
        } catch (err: any) {
          resolve({
            ...item,
            status: 'error',
            errorMessage: `픽셀 연산 에러: ${err.message || err}`
          });
        }
      };

      img.onerror = () => {
        resolve({
          ...item,
          status: 'error',
          errorMessage: '이미지를 불러올 수 없습니다.'
        });
      };
    });
  }, [bgDetectionMode, bgTolerance]);

  // ==========================================
  // 5. 이벤트 핸들러 (Event Handlers)
  // ==========================================

  // 파일 유효성 검사 및 로드
  const handleFiles = (files: FileList) => {
    const allowedType = "image/png";
    const maxFilesLimit = 50;
    const maxSizeBytes = 20 * 1024 * 1024; // 20MB
    const newItems: ImageItem[] = [];
    // 이미 50장 한도 도달 시 비차단 토스트 알림만 표시하고 중단
    const existingCount = images.length;
    if (existingCount >= maxFilesLimit) {
      addLog(`[업로드 제한] 이미 최대 ${maxFilesLimit}장이 업로드되어 있습니다.`, "error");
      showToast(`최대 ${maxFilesLimit}장까지 업로드 가능합니다. 현재 목록을 먼저 정리해 주세요.`, "error");
      return;
    }
    // 추가 시 한도 초과하는 경우: 초과분 자르고 허용 범위까지만 처리
    const remainingSlots = maxFilesLimit - existingCount;
    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    if (files.length > remainingSlots) {
      addLog(`[업로드 제한] ${files.length}장 중 ${remainingSlots}장까지만 추가됩니다. (총 50장 한도)`, "warning");
      showToast(`${remainingSlots}장만 추가되었습니다. 최대 50장 한도에 도달했습니다.`, "warning");
    }

    let invalidTypeCount = 0;
    let invalidSizeCount = 0;

    filesToProcess.forEach(file => {
      // PNG 타입 체크
      if (file.type !== allowedType) {
        addLog(`[유효하지 않은 파일] "${file.name}"은 PNG 파일이 아닙니다. PNG 이미지만 지원합니다.`, "error");
        invalidTypeCount++;
        return;
      }

      // 파일 크기 체크
      if (file.size > maxSizeBytes) {
        addLog(`[유효하지 않은 파일] "${file.name}"의 크기(${(file.size / (1024 * 1024)).toFixed(2)}MB)가 제한 용량(20MB)을 초과했습니다.`, "error");
        invalidSizeCount++;
        return;
      }

      // 검사 통과 시 임시 리스트에 추가
      const originalUrl = URL.createObjectURL(file);
      const imgItem: ImageItem = {
        id: Math.random().toString(36).substring(2, 9),
        file,
        name: file.name,
        size: file.size,
        originalUrl,
        croppedUrl: null,
        width: 0,
        height: 0,
        croppedWidth: null,
        croppedHeight: null,
        cropBox: null,
        padding: { top: 5, bottom: 5, left: 5, right: 5 }, // 사방 5px 안전 여백 기본 적용
        status: 'idle',
        errorMessage: null,
        noMargin: false,
        cropDetails: null
      };
      newItems.push(imgItem);
    });

    // 유효하지 않은 파일이 있었다면 토스트로 일괄 안내
    if (invalidTypeCount > 0) {
      showToast(`${invalidTypeCount}개 파일은 PNG 형식이 아니어서 제외되었습니다.`, "error");
    }
    if (invalidSizeCount > 0) {
      showToast(`${invalidSizeCount}개 파일은 20MB를 초과하여 제외되었습니다.`, "error");
    }

    if (newItems.length === 0) return;

    // 비동기 이미지 객체 로딩 후 실제 메타 해상도 취득
    const loadDimensionsPromises = newItems.map(item => {
      return new Promise<ImageItem>((resolve) => {
        const img = new Image();
        img.src = item.originalUrl;
        img.onload = () => {
          resolve({
            ...item,
            width: img.naturalWidth,
            height: img.naturalHeight
          });
        };
        img.onerror = () => {
          resolve(item);
        };
      });
    });

    Promise.all(loadDimensionsPromises).then(finalItems => {
      // 1단계: 업로드 즉시 각 이미지를 'processing'(분석 중) 상태로 표시하여 화면 스피너 우선 노출
      const processingItems = finalItems.map(item => ({
        ...item,
        status: 'processing' as const,
        padding: { top: paddingAll, bottom: paddingAll, left: paddingAll, right: paddingAll }
      }));

      setImages(prev => {
        const updated = [...prev, ...processingItems];
        // 업로드 후 첫 이미지가 있으면 바로 선택되게 활성화
        if (updated.length > 0 && !selectedImageId) {
          setSelectedImageId(updated[0].id);
        }
        return updated;
      });

      finalItems.forEach(item => {
        addLog(`"${item.name}" 업로드 완료 (${item.width}x${item.height} px)`, "info");
      });

      // 2단계: 각각의 이미지를 비동기로 백그라운드 크롭 분석 처리 즉시 실행 (핵심 개선 A & B)
      processingItems.forEach(item => {
        const defaultPadding = { top: paddingAll, bottom: paddingAll, left: paddingAll, right: paddingAll };
        processImageCrop(item, defaultPadding).then(processed => {
          setImages(current => {
            const idx = current.findIndex(img => img.id === item.id);
            if (idx === -1) return current;
            const clone = [...current];
            clone[idx] = processed;
            return clone;
          });

          // 자동 크롭 완료 실시간 알림 로그
          if (processed.status === 'done') {
            addLog(
              `"${processed.name}" 자동 여백 정리 성공: ` +
              `${processed.width}x${processed.height} px → ${processed.croppedWidth}x${processed.croppedHeight} px ` +
              `(사방 ${paddingAll}px 안전 여백 자동 추가 완료)`,
              "success"
            );
          } else {
            addLog(`"${processed.name}" 자동 여백 크롭 실패: ${processed.errorMessage}`, "error");
          }
        });
      });

      // 완료 후 결과물을 즉시 볼 수 있게 '작업 후 보기' 프리뷰 모드로 자동 변경
      setViewMode('after');
    });
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    // 드래그 중임을 시각적으로 표시
    setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // 단일 항목 삭제
  const removeImage = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const itemToRemove = images.find(img => img.id === id);
    if (!itemToRemove) return;

    // 브라우저 캐시 방지를 위해 기존 ObjectURL 메모리 해제
    URL.revokeObjectURL(itemToRemove.originalUrl);
    
    setImages(prev => {
      const filtered = prev.filter(img => img.id !== id);
      if (selectedImageId === id) {
        setSelectedImageId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });

    addLog(`"${itemToRemove.name}" 파일이 목록에서 제거되었습니다.`, "warning");
  };

  // ==========================================
  // 6. 비즈니스 코어 흐름 (Batch Operations)
  // ==========================================

  // 크랍 테스트 실행 (선택된 파일들 혹은 단일 파일 순차 연산 처리)
  const runCropAnalysis = async () => {
    if (images.length === 0) {
      // alert() 대신 비차단 토스트 사용
      showToast('업로드된 파일이 없습니다. PNG 파일을 먼저 업로드해 주세요.', 'warning');
      return;
    }

    setGlobalProcessing(true);
    setProgressPercent(0);
    addLog(`크랍 테스트 작업을 시작합니다... (총 ${images.length}장)`, "info");

    const updatedImages = [...images];
    for (let i = 0; i < updatedImages.length; i++) {
      const item = updatedImages[i];
      updatedImages[i] = { ...item, status: 'processing' };
      setImages([...updatedImages]); // 실시간 Spinner 렌더링을 위해 반영

      // 패딩 상태 가져오기
      const currentPadding = useIndividualPadding 
        ? { ...paddingIndividual } 
        : { top: paddingAll, bottom: paddingAll, left: paddingAll, right: paddingAll };

      // 이미지 처리 대기
      const processed = await processImageCrop(item, currentPadding);
      updatedImages[i] = processed;
      setImages([...updatedImages]);

      // 로그 기록
      if (processed.status === 'done') {
        if (processed.noMargin && Object.values(currentPadding).every(v => v === 0)) {
          addLog(`[${i+1}/${updatedImages.length}] "${processed.name}" - 제거할 여백이 없어 원본 상태를 유지했습니다.`, "info");
        } else {
          const d = processed.cropDetails;
          addLog(
            `[${i+1}/${updatedImages.length}] "${processed.name}" 크랍 성공: ` +
            `${processed.width}x${processed.height} → ${processed.croppedWidth}x${processed.croppedHeight} px ` +
            `(상:${d?.topRemoved}px, 하:${d?.bottomRemoved}px, 좌:${d?.leftRemoved}px, 우:${d?.rightRemoved}px 제거)`,
            "success"
          );
        }
      } else {
        addLog(`[${i+1}/${updatedImages.length}] "${processed.name}" 처리 실패: ${processed.errorMessage}`, "error");
      }

      setProgressPercent(Math.round(((i + 1) / updatedImages.length) * 100));
    }

    setGlobalProcessing(false);
    setViewMode('after'); // 완료 후 결과를 볼 수 있게 작업 후 프리뷰로 자동 변경
  };

  // 패딩이 변경될 때 선택된 이미지 실시간 즉시 재생성 (F-10 패딩 수동 조절 실시간 반영)
  const applyPaddingLive = useCallback(async (
    targetId: string, 
    newPadding: { top: number; bottom: number; left: number; right: number }
  ) => {
    setImages(prev => {
      const idx = prev.findIndex(img => img.id === targetId);
      if (idx === -1) return prev; // status 검사 제거하여 원본 크랍되지 않은 이미지도 즉각 반응하도록 수정

      // 백그라운드 비동기로 크랍 재생성 시작
      processImageCrop(prev[idx], newPadding).then(updated => {
        setImages(current => {
          const innerIdx = current.findIndex(img => img.id === targetId);
          if (innerIdx === -1) return current;
          const clone = [...current];
          clone[innerIdx] = updated;
          return clone;
        });
      });
      
      // 먼저 로딩을 살짝 표시하기 위해 processing 상태로 전환
      const clone = [...prev];
      clone[idx] = { ...clone[idx], padding: newPadding, status: 'processing' };
      return clone;
    });
  }, [processImageCrop]);

  // 감지 옵션(모드, 허용오차) 변경 시 실시간으로 현재 선택된 이미지 재연산
  const applyDetectionSettingsLive = useCallback(async (
    mode: 'auto' | 'transparent' | 'white',
    tolerance: number
  ) => {
    if (!selectedImageId) return;
    
    setImages(prev => {
      const idx = prev.findIndex(img => img.id === selectedImageId);
      if (idx === -1) return prev;

      const targetItem = prev[idx];
      const currentPadding = useIndividualPadding 
        ? { ...paddingIndividual } 
        : { top: paddingAll, bottom: paddingAll, left: paddingAll, right: paddingAll };

      // 비동기로 새로운 설정 값 기반 크롭 계산 실행
      processImageCrop(targetItem, currentPadding, mode, tolerance).then(updated => {
        setImages(current => {
          const innerIdx = current.findIndex(img => img.id === selectedImageId);
          if (innerIdx === -1) return current;
          const clone = [...current];
          clone[innerIdx] = updated;
          return clone;
        });
      });

      // 계산 중 임시 상태
      const clone = [...prev];
      clone[idx] = { ...clone[idx], status: 'processing' };
      return clone;
    });
  }, [selectedImageId, useIndividualPadding, paddingIndividual, paddingAll, processImageCrop]);

  // 패딩 설정 핸들러 (슬라이더 변화)
  const handlePaddingAllChange = (val: number) => {
    setPaddingAll(val);
    if (!useIndividualPadding && selectedImageId) {
      const paddingObj = { top: val, bottom: val, left: val, right: val };
      applyPaddingLive(selectedImageId, paddingObj);
    }
  };

  const handleIndividualPaddingChange = (direction: 'top' | 'bottom' | 'left' | 'right', val: number) => {
    const updated = { ...paddingIndividual, [direction]: val };
    setPaddingIndividual(updated);
    if (useIndividualPadding && selectedImageId) {
      applyPaddingLive(selectedImageId, updated);
    }
  };

  // ==========================================
  // 7. 다운로드 기능 (F-05)
  // ==========================================
  const downloadResults = async () => {
    // 만약 연산 작업이 안 되어있는 이미지가 존재한다면 자동 크랍 실행 후 다운로드
    const unProcessed = images.some(img => img.status === 'idle');
    if (unProcessed) {
      addLog("미처리된 이미지가 있어 다운로드 전 크랍 계산을 자동으로 실행합니다.", "warning");
      await runCropAnalysis();
    }

    const successImages = images.filter(img => img.status === 'done');
    if (successImages.length === 0) {
      alert("다운로드 가능한 이미지 결과물이 존재하지 않습니다.");
      return;
    }

    setGlobalProcessing(true);
    setProgressPercent(0);

    try {
      if (successImages.length === 1) {
        // 단일 이미지 직접 다운로드
        const item = successImages[0];
        const url = item.croppedUrl || item.originalUrl;
        const link = document.createElement('a');
        const originalBase = item.name.replace(/\.png$/i, '');
        
        link.href = url;
        link.download = `${originalBase}_cropped.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addLog(`단일 파일 다운로드 성공: "${originalBase}_cropped.png"`, "success");
      } else {
        // 다중 파일 ZIP 압축 다운로드
        addLog(`다중 이미지 압축 작업 시작... (압축 대상: ${successImages.length}장)`, "info");
        const zip = new JSZip();
        
        for (let i = 0; i < successImages.length; i++) {
          const item = successImages[i];
          const url = item.croppedUrl || item.originalUrl;
          const originalBase = item.name.replace(/\.png$/i, '');

          // DataURL(base64)에서 헤더 정보 잘라내고 순수 바이너리 정보 획득
          const base64Data = url.split(',')[1];
          zip.file(`${originalBase}_cropped.png`, base64Data, { base64: true });
          
          setProgressPercent(Math.round(((i + 1) / successImages.length) * 100));
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const zipUrl = URL.createObjectURL(content);
        const link = document.createElement('a');
        
        // 날짜 스탬프 포맷팅 YYYYMMDD_HHmmss
        const d = new Date();
        const dateStr = d.getFullYear().toString() +
          (d.getMonth() + 1).toString().padStart(2, '0') +
          d.getDate().toString().padStart(2, '0') + '_' +
          d.getHours().toString().padStart(2, '0') +
          d.getMinutes().toString().padStart(2, '0') +
          d.getSeconds().toString().padStart(2, '0');

        link.href = zipUrl;
        link.download = `cropped_images_${dateStr}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // 브라우저 가비지 컬렉션을 위해 메모리 해제
        setTimeout(() => URL.revokeObjectURL(zipUrl), 10000);
        addLog(`일괄 압축파일 다운로드 완료: "cropped_images_${dateStr}.zip"`, "success");
      }
    } catch (err: any) {
      addLog(`다운로드 도중 에러가 발생했습니다: ${err.message || err}`, "error");
      alert("다운로드 실패. 로그를 확인하세요.");
    } finally {
      setGlobalProcessing(false);
    }
  };

  // ==========================================
  // 8. 뷰포트 확대 / 축소 / Pan 드래그 조작 (F-06)
  // ==========================================
  const handleZoom = (direction: 'in' | 'out') => {
    setScale(prev => {
      const step = 0.1;
      const nextScale = direction === 'in' ? prev + step : prev - step;
      return Math.min(5.0, Math.max(0.1, nextScale)); // 범위 10% ~ 500%
    });
  };

  const handleZoomReset = () => {
    setScale(1.0);
    setOffset({ x: 0, y: 0 });
    addLog("프리뷰 배율 및 위치가 초기화(100%) 되었습니다.", "info");
  };

  const handleZoomFit = () => {
    if (!previewAreaRef.current) return;
    const current = images.find(img => img.id === selectedImageId);
    if (!current) return;

    const containerW = previewAreaRef.current.clientWidth - 48; // 여유 간격 고려
    const containerH = previewAreaRef.current.clientHeight - 48;
    const imgW = viewMode === 'after' && current.croppedWidth ? current.croppedWidth : current.width;
    const imgH = viewMode === 'after' && current.croppedHeight ? current.croppedHeight : current.height;

    if (imgW <= 0 || imgH <= 0) return;

    const scaleX = containerW / imgW;
    const scaleY = containerH / imgH;
    const bestScale = Math.min(scaleX, scaleY, 1.0); // 원본보다 확대해서 핏시키지는 않게 함

    setScale(Math.max(0.1, parseFloat(bestScale.toFixed(2))));
    setOffset({ x: 0, y: 0 });
    addLog(`화면 맞춤 비율(${Math.round(bestScale * 100)}%)이 적용되었습니다.`, "info");
  };

  // 마우스 드래그 시작
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return; // 마우스 왼쪽 버튼 클릭만 드래그 이동 지원
    setIsDragging(true);
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // 마우스 드래그 이동
  const onPointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  // 마우스 드래그 해제
  const onPointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // 마우스 휠 감지 Zoom 연동 (Wheel Handler)
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault(); // 브라우저 창 스크롤 방지
    const zoomFactor = 0.05;
    setScale(prev => {
      const nextScale = e.deltaY < 0 ? prev + zoomFactor : prev - zoomFactor;
      return Math.min(5.0, Math.max(0.1, nextScale));
    });
  };

  // ==========================================
  // 9. 전체 초기화 (F-08)
  // ==========================================
  const triggerReset = () => {
    const confirmResult = window.confirm("모든 업로드 파일과 작업 내역을 초기화하시겠습니까?");
    if (!confirmResult) return;

    // 가비지 컬렉션을 위해 생성된 모든 ObjectURL 해제
    images.forEach(img => {
      URL.revokeObjectURL(img.originalUrl);
    });

    setImages([]);
    setSelectedImageId(null);
    setViewMode('before');
    setLogs([]);
    setPaddingAll(0);
    setPaddingIndividual({ top: 0, bottom: 0, left: 0, right: 0 });
    setUseIndividualPadding(false);
    setScale(1.0);
    setOffset({ x: 0, y: 0 });
    setProgressPercent(0);
    
    setTimeout(() => {
      addLog("모든 데이터가 완벽하게 초기화되었습니다.", "warning");
    }, 100);
  };

  // ==========================================
  // 10. 계산 필드 (Computed Fields)
  // ==========================================
  const currentImage = images.find(img => img.id === selectedImageId);
  const totalSize = images.reduce((acc, curr) => acc + curr.size, 0);

  // ==========================================
  // 11. JSX 렌더링 시작
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-300 font-sans">
      
      {/* HEADER AREA */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-primary to-indigo-600 p-2.5 rounded-xl text-white shadow-md shadow-primary/20">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-indigo-600 bg-clip-text text-transparent dark:from-blue-400 dark:to-indigo-400">
              이미지 여백 자동 크랍 PRO
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              PNG Image Margin Auto-Crop Professional Tool
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* 가이드 안내 버튼 */}
          <button 
            onClick={() => {
              setGuideActiveTab('miri');
              setShowGuideModal(true);
            }}
            className="flex items-center gap-1 px-3 py-2 text-sm rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors"
            aria-label="가이드 열기"
          >
            <Info className="w-4 h-4 text-primary" />
            <span className="hidden md:inline font-medium">플랫폼 규격 가이드</span>
          </button>

          {/* 다크/라이트 테마 변경 버튼 */}
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 transition-colors"
            aria-label={isDarkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
          >
            {isDarkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
          </button>
        </div>
      </header>

      {/* SUB BANNER AREA */}
      <section className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-indigo-950/40 border-b border-slate-200 dark:border-slate-800/80 px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center justify-center bg-primary/10 text-primary text-xs px-2.5 py-0.5 rounded-full font-bold">
            NOTICE
          </span>
          <p className="font-medium text-xs sm:text-sm">
            미리캔버스·망고보드 등 요소 디자인 제출을 위한 PNG 여백 제거 최적화 도구입니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => {
              setGuideActiveTab('miri');
              setShowGuideModal(true);
              addLog("미리캔버스 규격 가이드 모달이 열렸습니다.", "info");
            }} 
            className="text-xs text-primary hover:underline font-semibold"
          >
            [미리캔버스 규격 팁]
          </button>
          <button 
            onClick={() => {
              setGuideActiveTab('mango');
              setShowGuideModal(true);
              addLog("망고보드 규격 가이드 모달이 열렸습니다.", "info");
            }}
            className="text-xs text-indigo-500 hover:underline font-semibold"
          >
            [망고보드 규격 팁]
          </button>
        </div>
      </section>

      {/* MAIN CONTAINER */}
      <main className="p-6 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: UPLOAD & LIST (lg:col-span-4) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* FILE UPLOAD DROPZONE - 50장 도달 시 비활성화, 드래그 오버 시 하이라이트 */}
          <div 
            onDragOver={images.length < 50 ? onDragOver : undefined}
            onDragLeave={onDragLeave}
            onDrop={images.length < 50 ? onDrop : undefined}
            onClick={() => images.length < 50 && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-300 group ${
              images.length >= 50
                // 50장 한도 도달 시: 비활성화 스타일
                ? 'border-slate-200 dark:border-slate-800/50 bg-slate-50 dark:bg-slate-900/50 cursor-not-allowed opacity-60'
                : isDragOver
                  // 드래그 오버 중: 강조 스타일
                  ? 'border-primary bg-primary/5 dark:bg-blue-950/30 shadow-xl shadow-primary/10 cursor-copy scale-[1.01]'
                  // 기본 상태: 호버 인터랙션
                  : 'border-slate-300 hover:border-primary dark:border-slate-800 dark:hover:border-blue-500 bg-white dark:bg-slate-900 cursor-pointer hover:shadow-xl hover:shadow-primary/5'
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              multiple 
              accept=".png" 
              className="hidden" 
            />
            <div className="flex flex-col items-center gap-3">
              <div className={`p-4 rounded-full transition-colors ${
                isDragOver 
                  ? 'bg-primary/10 text-primary' 
                  : images.length >= 50
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:text-primary group-hover:bg-primary/10'
              }`}>
                {isDragOver 
                  ? <PackageOpen className="w-6 h-6 animate-bounce" /> 
                  : <Upload className="w-6 h-6" />
                }
              </div>
              <div>
                {images.length >= 50 ? (
                  // 50장 한도 도달 메시지
                  <>
                    <p className="font-semibold text-sm text-slate-500">최대 업로드 개수(50장)에 도달했습니다</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      목록에서 파일을 제거한 후 추가 업로드할 수 있습니다.
                    </p>
                  </>
                ) : isDragOver ? (
                  // 드래그 오버 중 메시지
                  <>
                    <p className="font-bold text-sm text-primary">여기에 파일을 놓으세요!</p>
                    <p className="text-xs text-primary/70 mt-1">PNG 파일을 드롭하여 추가합니다.</p>
                  </>
                ) : (
                  // 기본 안내 메시지
                  <>
                    <p className="font-semibold text-sm">PNG 파일을 드래그 & 드롭하거나 클릭하여 업로드</p>
                    <p className="text-xs text-primary dark:text-blue-400 font-bold mt-1.5">
                      ⚡ 업로드 즉시 배경색을 자동 감지하여 오브젝트만 타이트하게 크롭합니다!
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                      최대 50장 • 장당 20MB 이하 • 흰색/크림/단색 배경 PNG 전용
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* UPLOADED FILES LIST */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 flex flex-col flex-1 min-h-[300px] max-h-[500px]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h2 className="font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                대기 목록
                {/* 업로드 후 파일 수/총 용량 정보 표시 (PRD F-01 요건) */}
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                  images.length >= 50 
                    ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-500' 
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}>
                  {images.length} / 50장
                </span>
              </h2>
              {images.length > 0 && (
                <div className="flex items-center gap-2">
                  {/* 처리 완료된 장 수 요약 */}
                  {images.some(img => img.status === 'done') && (
                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full">
                      ✓ {images.filter(img => img.status === 'done').length}장 완료
                    </span>
                  )}
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {(totalSize / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
              )}
            </div>

            {/* LIST INNER CONTAINER */}
            <div className="overflow-y-auto flex-1 mt-3 space-y-2 pr-1">
              {images.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 py-12">
                  <p className="text-sm">목록이 비어있습니다.</p>
                  <p className="text-xs mt-1">파일을 업로드하여 작업을 시작해보세요.</p>
                </div>
              ) : (
                images.map(img => {
                  const isSelected = img.id === selectedImageId;
                  let statusBg = 'bg-slate-100 dark:bg-slate-800 text-slate-500';
                  let statusText = '대기 중';
                  if (img.status === 'processing') {
                    statusBg = 'bg-blue-100 dark:bg-blue-950/50 text-blue-500 animate-pulse';
                    statusText = '분석 중';
                  } else if (img.status === 'done') {
                    statusBg = 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-500';
                    statusText = img.noMargin ? '여백 없음' : '완료';
                  } else if (img.status === 'error') {
                    statusBg = 'bg-rose-100 dark:bg-rose-950/50 text-rose-500';
                    statusText = '오류';
                  }

                  return (
                    <div
                      key={img.id}
                      onClick={() => setSelectedImageId(img.id)}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer border transition-all ${
                        isSelected 
                          ? 'border-primary bg-primary/5 dark:bg-blue-950/20' 
                          : 'border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        {/* 썸네일 */}
                        <div className="w-10 h-10 bg-checkered rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 flex-shrink-0 flex items-center justify-center">
                          <img src={img.originalUrl} alt="Thumbnail" className="max-w-full max-h-full object-contain" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-sm font-semibold truncate dark:text-slate-200" title={img.name}>
                            {img.name}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                            {img.width}x{img.height} px • {(img.size / 1024).toFixed(0)} KB
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusBg}`}>
                          {statusText}
                        </span>
                        <button
                          onClick={(e) => removeImage(img.id, e)}
                          className="p-1 text-slate-400 hover:text-warningRed dark:hover:text-rose-400 transition-colors"
                          aria-label={`${img.name} 리스트에서 제외`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* ACTION BUTTONS (LEFT PAN) */}
            {images.length > 0 && (
              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex gap-2">
                <button
                  onClick={runCropAnalysis}
                  disabled={globalProcessing}
                  className="flex-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-350 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 font-bold text-xs py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.01]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${globalProcessing ? 'animate-spin' : ''}`} />
                  여백 일괄 재계산 (동기화)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: PREVIEW & CONTROLS (lg:col-span-8) */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* PREVIEW CONTAINER */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 flex flex-col">
            
            {/* VIEW MODE TOGGLE BUTTONS */}
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <div className="flex gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  onClick={() => setViewMode('before')}
                  disabled={!currentImage}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    viewMode === 'before'
                      ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  } disabled:opacity-40`}
                >
                  작업 전 보기
                </button>
                <button
                  onClick={() => setViewMode('after')}
                  disabled={!currentImage || !currentImage.croppedUrl}
                  className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    viewMode === 'after'
                      ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  } disabled:opacity-40`}
                >
                  작업 후 보기
                </button>
              </div>

              {/* 프리뷰 상단 상태 레이블 */}
              {currentImage && (
                <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {viewMode === 'before' ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      원본 이미지 (여백 포함)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-500 font-bold">
                      <Check className="w-3.5 h-3.5" />
                      크랍 완료 (수동 패딩 포함)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* PREVIEW VIEWPORT AREA */}
            <div 
              ref={previewAreaRef}
              onWheel={onWheel}
              className="relative w-full h-[400px] md:h-[480px] bg-checkered rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center select-none"
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
              {currentImage ? (
                <div
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  className="absolute w-full h-full flex items-center justify-center"
                >
                  <div
                    style={{
                      transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                      transformOrigin: 'center center',
                      transition: isDragging ? 'none' : 'transform 0.15s ease-out'
                    }}
                    className="relative max-w-[90%] max-h-[90%] flex items-center justify-center pointer-events-none"
                  >
                    {/* 투명 배경에 대비되는 실제 보더라인을 그려줌으로써 잘린 영역을 시각적으로 확인 */}
                    <img
                      src={viewMode === 'before' ? currentImage.originalUrl : (currentImage.croppedUrl || currentImage.originalUrl)}
                      alt="Crop Preview Target"
                      className="max-w-full max-h-full object-contain border border-primary/30 shadow-2xl"
                    />

                    {/* 여백 크기 시각 가이드 (원본 보기 중이고 감지된 영역이 있을 경우에만 렌더링) */}
                    {viewMode === 'before' && currentImage.cropBox && (
                      <div 
                        className="absolute border-2 border-dashed border-primary pointer-events-none"
                        style={{
                          left: `${(currentImage.cropBox.left / currentImage.width) * 100}%`,
                          top: `${(currentImage.cropBox.top / currentImage.height) * 100}%`,
                          width: `${(currentImage.cropBox.width / currentImage.width) * 100}%`,
                          height: `${(currentImage.cropBox.height / currentImage.height) * 100}%`
                        }}
                      >
                        <span className="absolute -top-6 left-0 bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow">
                          실제 요소 영역 (크랍 예정)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-slate-400 dark:text-slate-600 text-center flex flex-col items-center gap-2">
                  <Maximize2 className="w-10 h-10 stroke-[1.5]" />
                  <p className="text-sm font-semibold">대기 목록에서 이미지를 선택해 주세요.</p>
                  <p className="text-xs">마우스 휠 스크롤로 줌, 마우스 드래그로 화면 이동이 가능합니다.</p>
                </div>
              )}

              {/* 진행바 레이어 (글로벌 작업 중일 때 표시) */}
              {globalProcessing && (
                <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-3 z-20">
                  <div className="w-12 h-12 border-4 border-white/20 border-t-primary rounded-full animate-spin"></div>
                  <p className="font-semibold text-sm">크랍 처리 중... ({progressPercent}%)</p>
                  <div className="w-48 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-primary h-full transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
                  </div>
                </div>
              )}
            </div>

            {/* PREVIEW CONTROLLERS */}
            {currentImage && (
              <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                
                {/* 줌 배율 수치 & 조작계 */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-xl">
                  <button 
                    onClick={() => handleZoom('out')} 
                    className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white"
                    title="축소"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold w-12 text-center text-slate-600 dark:text-slate-300">
                    {Math.round(scale * 100)}%
                  </span>
                  <button 
                    onClick={() => handleZoom('in')} 
                    className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white"
                    title="확대"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                  <div className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700 mx-1"></div>
                  <button 
                    onClick={handleZoomFit} 
                    className="px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white"
                  >
                    화면 맞춤
                  </button>
                  <button 
                    onClick={handleZoomReset} 
                    className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white"
                    title="초기화"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* 하단 메타 데이터 정보 */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                  <p>
                    <span className="font-semibold text-slate-400">파일명:</span> {currentImage.name}
                  </p>
                  <p>
                    <span className="font-semibold text-slate-400">원본 크기:</span> {currentImage.width} × {currentImage.height} px
                  </p>
                  {currentImage.croppedWidth && (
                    <p className="text-emerald-500 dark:text-emerald-400 font-bold">
                      <span className="font-semibold text-slate-400">크랍 후 크기:</span> {currentImage.croppedWidth} × {currentImage.croppedHeight} px
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* F-10 & F-11 통합: 상세 수동 미세조정 전문가용 접이식 아코디언 (핵심 개선 C) */}
          {currentImage && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 flex flex-col gap-4">
              <button
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                className="flex items-center justify-between w-full text-left focus:outline-hidden"
              >
                <h3 className="font-bold text-sm flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Sliders className="w-4 h-4 text-primary" />
                  상세 수동 미세조정 (전문가용 옵션)
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-semibold">
                    {showAdvancedSettings ? "접기" : "펼치기 (배경색/패딩 커스텀)"}
                  </span>
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${showAdvancedSettings ? 'rotate-90' : ''}`} />
                </div>
              </button>

              {showAdvancedSettings && (
                <div className="flex flex-col gap-6 pt-4 border-t border-slate-100 dark:border-slate-800/80 transition-all duration-300">
                  
                  {/* 파트 1: 여백 감지 분석 옵션 */}
                  <div className="flex flex-col gap-4 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-2xl border border-slate-100 dark:border-slate-850">
                    <div className="flex items-center justify-between pb-1">
                      <h4 className="text-xs font-extrabold text-slate-600 dark:text-slate-350 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-primary" />
                        여백 감지 분석 기준 설정
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold text-slate-400">감지 모드 선택</label>
                        <div className="flex items-center bg-slate-200/50 dark:bg-slate-800 p-0.5 rounded-xl text-xs font-semibold">
                          {/* 자동 감지 (모서리 샘플링) - 기본값, 대부분의 화이트/크림 배경에서 완벽 동작 */}
                          <button
                            onClick={() => {
                              setBgDetectionMode('auto');
                              applyDetectionSettingsLive('auto', bgTolerance);
                            }}
                            className={`flex-1 py-1.5 text-center rounded-lg transition-all text-[10px] ${
                              bgDetectionMode === 'auto'
                                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs font-bold'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                          >
                            화이트/크림 자동
                          </button>
                          {/* 투명 배경 PNG 전용 */}
                          <button
                            onClick={() => {
                              setBgDetectionMode('transparent');
                              applyDetectionSettingsLive('transparent', bgTolerance);
                            }}
                            className={`flex-1 py-1.5 text-center rounded-lg transition-all text-[10px] ${
                              bgDetectionMode === 'transparent'
                                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs font-bold'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                          >
                            투명 배경
                          </button>
                          {/* 흰색 고정 */}
                          <button
                            onClick={() => {
                              setBgDetectionMode('white');
                              applyDetectionSettingsLive('white', bgTolerance);
                            }}
                            className={`flex-1 py-1.5 text-center rounded-lg transition-all text-[10px] ${
                              bgDetectionMode === 'white'
                                ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs font-bold'
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                          >
                            흰색 고정
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-slate-400">흰색 오차 민감도 ({bgTolerance})</label>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            disabled={bgDetectionMode === 'transparent'}
                            value={bgTolerance}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              setBgTolerance(val);
                              applyDetectionSettingsLive(bgDetectionMode, val);
                            }}
                            className="flex-1 accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg disabled:opacity-35"
                          />
                          <span className="text-[10px] font-bold text-slate-400 w-8 text-right">{bgTolerance}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 파트 2: 수동 미세 패딩 피팅 */}
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-extrabold text-slate-600 dark:text-slate-350 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-primary" />
                        여백 패딩(픽셀) 상세 미세조정
                      </h4>
                      
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-850 p-0.5 rounded-lg text-[10px]">
                        <button
                          onClick={() => {
                            setUseIndividualPadding(false);
                            const paddingObj = { top: paddingAll, bottom: paddingAll, left: paddingAll, right: paddingAll };
                            applyPaddingLive(currentImage.id, paddingObj);
                          }}
                          className={`px-2 py-0.5 rounded-md ${
                            !useIndividualPadding ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs font-bold' : 'text-slate-500'
                          }`}
                        >
                          일괄
                        </button>
                        <button
                          onClick={() => {
                            setUseIndividualPadding(true);
                            applyPaddingLive(currentImage.id, paddingIndividual);
                          }}
                          className={`px-2 py-0.5 rounded-md ${
                            useIndividualPadding ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-xs font-bold' : 'text-slate-500'
                          }`}
                        >
                          개별
                        </button>
                      </div>
                    </div>

                    {!useIndividualPadding ? (
                      <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800/20 p-3 rounded-xl">
                        <label className="text-xs font-semibold text-slate-500 w-24 flex-shrink-0">
                          전체 여백: {paddingAll}px
                        </label>
                        <input
                          type="range"
                          min="-100"
                          max="200"
                          value={paddingAll}
                          onChange={(e) => handlePaddingAllChange(parseInt(e.target.value))}
                          className="flex-1 accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg cursor-pointer"
                        />
                        <input
                          type="number"
                          min="-100"
                          max="200"
                          value={paddingAll}
                          onChange={(e) => handlePaddingAllChange(Math.min(200, Math.max(-100, parseInt(e.target.value) || 0)))}
                          className="w-16 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-slate-50 dark:bg-slate-800 text-center"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/20 p-3 rounded-xl">
                        <div className="flex items-center gap-3">
                          <label className="text-xs font-semibold text-slate-500 w-16 flex-shrink-0">상단 (Top)</label>
                          <input
                            type="range"
                            min="-100"
                            max="200"
                            value={paddingIndividual.top}
                            onChange={(e) => handleIndividualPaddingChange('top', parseInt(e.target.value))}
                            className="flex-1 accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg"
                          />
                          <span className="text-xs text-slate-500 font-bold w-10 text-right">{paddingIndividual.top}px</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <label className="text-xs font-semibold text-slate-500 w-16 flex-shrink-0">하단 (Bottom)</label>
                          <input
                            type="range"
                            min="-100"
                            max="200"
                            value={paddingIndividual.bottom}
                            onChange={(e) => handleIndividualPaddingChange('bottom', parseInt(e.target.value))}
                            className="flex-1 accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg"
                          />
                          <span className="text-xs text-slate-500 font-bold w-10 text-right">{paddingIndividual.bottom}px</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <label className="text-xs font-semibold text-slate-500 w-16 flex-shrink-0">좌측 (Left)</label>
                          <input
                            type="range"
                            min="-100"
                            max="200"
                            value={paddingIndividual.left}
                            onChange={(e) => handleIndividualPaddingChange('left', parseInt(e.target.value))}
                            className="flex-1 accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg"
                          />
                          <span className="text-xs text-slate-500 font-bold w-10 text-right">{paddingIndividual.left}px</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <label className="text-xs font-semibold text-slate-500 w-16 flex-shrink-0">우측 (Right)</label>
                          <input
                            type="range"
                            min="-100"
                            max="200"
                            value={paddingIndividual.right}
                            onChange={(e) => handleIndividualPaddingChange('right', parseInt(e.target.value))}
                            className="flex-1 accent-primary h-1 bg-slate-200 dark:bg-slate-800 rounded-lg"
                          />
                          <span className="text-xs text-slate-500 font-bold w-10 text-right">{paddingIndividual.right}px</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed border-t border-slate-100 dark:border-slate-800/80 pt-3">
                    💡 <strong>꿀팁:</strong> 수동 조절 값을 <strong>음수(-)</strong>로 당기면 요소 경계 안쪽을 깎아내는 <strong>'이너 크롭(Inner Crop)'</strong>이 작동하여 잔여 배경색의 미세한 지저분함을 완전 제거할 수 있습니다.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* MAIN DOWNLOAD ACTION BAR */}
          {images.length > 0 && (
            <button
              onClick={downloadResults}
              disabled={globalProcessing}
              className="w-full bg-gradient-to-r from-primary to-indigo-600 hover:from-primary-hover hover:to-indigo-700 text-white font-extrabold py-4 px-6 rounded-2xl flex items-center justify-center gap-3 shadow-xl shadow-primary/20 hover:shadow-primary/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              <Download className="w-5 h-5" />
              <span>
                {images.length > 1 ? `크랍 완료 파일 일괄 ZIP 다운로드 (${images.length}장)` : '크랍 이미지 개별 PNG 다운로드'}
              </span>
            </button>
          )}

          {/* LOG AREA (F-07) */}
          <div className="bg-terminalBg rounded-2xl border border-slate-800 p-4 flex flex-col h-[220px]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                <span className="w-3 h-3 rounded-full bg-amber-400"></span>
                <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                <span className="text-xs font-bold font-mono text-terminalText/80 ml-2">Console 작업 로그</span>
              </div>
              <button
                onClick={triggerReset}
                className="text-[11px] font-mono text-rose-400 hover:text-rose-300 flex items-center gap-1 transition-colors"
                aria-label="콘솔 로그 및 목록 전체 초기화"
              >
                <RotateCcw className="w-3 h-3" />
                전체 초기화
              </button>
            </div>
            
            <div 
              ref={logContainerRef}
              className="flex-1 overflow-y-auto font-mono text-xs text-terminalText space-y-1.5 pr-2"
            >
              {logs.map(log => {
                let textClass = 'text-slate-300';
                if (log.type === 'success') textClass = 'text-emerald-400';
                if (log.type === 'error') textClass = 'text-rose-400';
                if (log.type === 'warning') textClass = 'text-amber-300';

                return (
                  <div key={log.id} className="flex gap-2 items-start leading-relaxed">
                    <span className="text-slate-500 select-none">[{log.timestamp}]</span>
                    <span className={textClass}>{log.message}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </main>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 dark:border-slate-800 py-6 mt-12 text-center text-xs text-slate-400 dark:text-slate-500">
        <p>© 2026 이미지 여백 자동 크랍 PRO. All Rights Reserved. Client-Side Only (No Server Uploads).</p>
      </footer>

      {/* ==========================================
          12. 가이드 팝업 모달 (Guide Modal UI)
          ========================================== */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <h3 className="text-lg font-bold flex items-center gap-2 mb-4">
              <HelpCircle className="w-5 h-5 text-primary" />
              디자인 플랫폼 크리에이터 규격 및 가이드
            </h3>
            
            {/* 탭 버튼 헤더 */}
            <div className="flex border-b border-slate-100 dark:border-slate-800 mb-4 text-xs sm:text-sm font-semibold">
              <button
                onClick={() => setGuideActiveTab('miri')}
                className={`flex-1 pb-2 border-b-2 transition-all ${
                  guideActiveTab === 'miri' 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                미리캔버스 (MiriCanvas)
              </button>
              <button
                onClick={() => setGuideActiveTab('mango')}
                className={`flex-1 pb-2 border-b-2 transition-all ${
                  guideActiveTab === 'mango' 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                망고보드 (MangoBoard)
              </button>
              <button
                onClick={() => setGuideActiveTab('security')}
                className={`flex-1 pb-2 border-b-2 transition-all ${
                  guideActiveTab === 'security' 
                    ? 'border-primary text-primary' 
                    : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                보안 및 안정성 안내
              </button>
            </div>

            {/* 탭 본문 영역 */}
            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300 min-h-[220px]">
              {guideActiveTab === 'miri' && (
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in duration-200">
                  <h4 className="font-bold text-primary dark:text-blue-400 flex items-center gap-2 text-xs uppercase tracking-wider mb-2">
                    <ChevronRight className="w-4 h-4" /> 미리캔버스 요소 제출 표준 규격
                  </h4>
                  <ul className="list-disc pl-5 space-y-1.5 text-xs leading-relaxed">
                    <li><strong>투명 PNG 필수:</strong> 요소 업로드 시 배경 투명화는 필수 사양입니다.</li>
                    <li><strong>여백 최소화 규격:</strong> 개체의 외곽 여백을 아예 0px로 밀착하여 잘라내지 않으면 "불필요한 투명 여백 포함" 사유로 심사가 반려됩니다. 본 툴에서 크랍 연산 후 패딩 추가 없이(0px) 바로 다운로드하시는 것이 가장 안전합니다.</li>
                    <li><strong>파일명 가이드:</strong> 특수문자가 들어간 파일명은 미리캔버스 시스템에서 업로드 에러를 유발하므로 특수문자를 제거해 주세요.</li>
                  </ul>
                </div>
              )}

              {guideActiveTab === 'mango' && (
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in duration-200">
                  <h4 className="font-bold text-indigo-500 dark:text-indigo-400 flex items-center gap-2 text-xs uppercase tracking-wider mb-2">
                    <ChevronRight className="w-4 h-4" /> 망고보드 요소 제출 권장 규격
                  </h4>
                  <ul className="list-disc pl-5 space-y-1.5 text-xs leading-relaxed">
                    <li><strong>보증 마진 여백:</strong> 너무 꽉 찬 크기로 크랍될 경우 외곽 일부가 렌더링 도중 미세하게 잘릴 수 있으므로, 외곽 테두리에 약 10px 정도의 여백을 두는 것을 권장합니다. 이때 본 툴의 [상하좌우 일괄] 슬라이더를 10px로 맞추고 저장하시는 것을 추천합니다.</li>
                    <li><strong>용량 최적화:</strong> 장당 3MB 이하 요소를 권장합니다. 이 도구는 서버 전송 없이 무손실로 PNG 인코딩을 수행합니다.</li>
                  </ul>
                </div>
              )}

              {guideActiveTab === 'security' && (
                <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in duration-200">
                  <h4 className="font-bold text-amber-500 flex items-center gap-2 text-xs uppercase tracking-wider mb-2">
                    <AlertCircle className="w-4 h-4" /> 안심 로컬 이미지 처리 보안 안내
                  </h4>
                  <p className="text-xs leading-relaxed">
                    본 도구는 업로드한 이미지를 어떤 외부 서버로도 전송하거나 수집하지 않는 <strong>100% 클라이언트 브라우저 전용</strong> 서비스입니다. 브라우저의 HTML5 Canvas API를 사용하여 픽셀 데이터를 즉각 처리하므로, 창작자 소중한 원저작물의 무단 유출 걱정 없이 완벽하게 개인정보 및 자산 보안을 보장받으실 수 있습니다.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowGuideModal(false)}
                className="bg-primary hover:bg-primary-hover text-white font-bold px-6 py-2 rounded-xl text-xs shadow-md shadow-primary/10 transition-colors"
              >
                가이드 닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          13. 토스트 알림 스택 (인라인 알림, alert() 완전 대체)
          - 화면 오른쪽 하단 고정
          - 에러/경고/성공/정보 타입별 컬러 구분
          ========================================== */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
          {toasts.map(toast => {
            // 타입에 따른 컬러 시스템
            const styles = {
              error:   'bg-rose-600 border-rose-500 text-white',
              warning: 'bg-amber-500 border-amber-400 text-white',
              success: 'bg-emerald-600 border-emerald-500 text-white',
              info:    'bg-slate-800 border-slate-600 text-white dark:bg-slate-700',
            };
            const icons = {
              error:   <AlertCircle className="w-4 h-4 flex-shrink-0" />,
              warning: <AlertCircle className="w-4 h-4 flex-shrink-0" />,
              success: <Check className="w-4 h-4 flex-shrink-0" />,
              info:    <Info className="w-4 h-4 flex-shrink-0" />,
            };
            return (
              <div
                key={toast.id}
                className={`flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-sm pointer-events-auto text-sm font-medium ${styles[toast.type]}`}
                style={{ animation: 'slideInRight 0.25s ease-out' }}
              >
                {icons[toast.type]}
                <span className="flex-1 leading-snug">{toast.message}</span>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="opacity-70 hover:opacity-100 transition-opacity ml-1 flex-shrink-0"
                  aria-label="알림 닫기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* 토스트 슬라이드인 애니메이션 */}
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(100%); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

    </div>
  );
}
