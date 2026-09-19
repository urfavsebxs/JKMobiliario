import { useEffect, useMemo, useRef, useState } from "react";
import { API_URL } from "../../lib/apiBase";
import {
  CATEGORIAS_POR_DEFECTO,
  compararCategorias,
  normalizarCategoria,
} from "../../lib/categorias";
import type { CategoriaVista } from "../../lib/categorias";
import { proxyImageUrl } from "../../lib/images";
import { descuentoAplicable, formatPrice, precioConDescuento } from "../../lib/precio";
import type { Category, MedidasBase } from "../../lib/types";
import { adminFetch, mensajeError } from "./admin/adminApi";

interface Props {
  productId?: string;
  product?: any;
}

/** Convierte una dimensión a cm: los valores ≤ 20 se asumen en metros (×100). */
const aCentimetros = (valor: number): number => (valor > 0 && valor <= 20 ? valor * 100 : valor);

/** Etiquetas de las casillas de dimensiones, en el orden del payload. */
const CAMPOS_DIMENSION: Array<{ campo: "ancho" | "largo" | "alto"; etiqueta: string }> = [
  { campo: "ancho", etiqueta: "Ancho (cm)" },
  { campo: "largo", etiqueta: "Largo (cm)" },
  { campo: "alto", etiqueta: "Alto (cm)" },
];

/**
 * Prellena las casillas Ancho/Largo/Alto a partir del string `dimensions`
 * guardado. Se toma el primer segmento (dividido por "·", "|", ";" o saltos de
 * línea) con marca de par ("x"/"X"/"×") y sus tres primeros números, igual que
 * el filtro del catálogo. Los textos legacy sin marca de par (p. ej.
 * "4, 6 u 8 asientos") dejan las casillas vacías y se conservan al guardar.
 */
function parsearDimensiones(dimensions?: string): { ancho: string; largo: string; alto: string } {
  const vacio = { ancho: "", largo: "", alto: "" };
  if (!dimensions) return vacio;

  for (const segmento of dimensions.split(/[·|;\n\r]+/)) {
    if (!/[x×]/i.test(segmento)) continue;

    const numeros = (segmento.match(/\d+(?:[.,]\d+)?/g) ?? []).map((numero) =>
      Number(numero.replace(",", "."))
    );
    if (numeros.length === 0) continue;

    const [ancho = "", largo = "", alto = ""] = numeros
      .slice(0, 3)
      .map((valor) => String(aCentimetros(valor)));

    return { ancho, largo, alto };
  }

  return vacio;
}

export default function ProductForm({ productId, product }: Props) {
  const [formData, setFormData] = useState({
    name: product?.name || "",
    description: product?.description || "",
    // Los numéricos viven como texto para poder quedar vacíos mientras se edita.
    price: product?.price != null ? String(product.price) : "",
    stock: product?.stock != null ? String(product.stock) : "",
    category: product?.category || "",
  });

  const [sizes, setSizes] = useState<string[]>(product?.sizes || []);
  const [newSize, setNewSize] = useState("");

  const [colors, setColors] = useState<{ name: string; hex: string }[]>(product?.colors || []);
  const [newColorName, setNewColorName] = useState("");
  const [newColorHex, setNewColorHex] = useState("#000000");

  const [variants, setVariants] = useState<any[]>(product?.variants || []);
  const [newVariant, setNewVariant] = useState({ size: "", color: "", colorHex: "", stock: 0, price: 0 });

  const [discountPercent, setDiscountPercent] = useState<string>(
    product?.discountPercent != null ? String(descuentoAplicable(product.discountPercent)) : ""
  );
  const [dimensiones, setDimensiones] = useState(() => parsearDimensiones(product?.dimensions));
  const [medidasBase, setMedidasBase] = useState({
    ancho: product?.medidasBase?.ancho?.toString() ?? "",
    largo: product?.medidasBase?.largo?.toString() ?? "",
    alto: product?.medidasBase?.alto?.toString() ?? "",
  });

  const [images, setImages] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>(product?.images || []);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [existingModel, setExistingModel] = useState<string | null>(product?.model3d || null);
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [error, setError] = useState("");

  // ─── Categorías ─────────────────────────────────────────────────────
  const [categorias, setCategorias] = useState<CategoriaVista[]>(CATEGORIAS_POR_DEFECTO);
  const [creandoCategoria, setCreandoCategoria] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState({ nombre: "", grupo: "" });
  const [creandoCategoriaAhora, setCreandoCategoriaAhora] = useState(false);
  const [errorCategoria, setErrorCategoria] = useState("");

  // Última categoría real elegida: permite volver a ella si se cancela la
  // creación de una categoría nueva.
  const categoriaAnterior = useRef(formData.category);

  const MODELO_MAX_MB = 25;

  // El select de categoría comparte `handleInputChange` con el resto del
  // formulario, así que el panel de "nueva categoría" se abre o cierra
  // observando el valor elegido (`__nueva__` es una opción centinela).
  useEffect(() => {
    if (formData.category === "__nueva__") {
      setCreandoCategoria(true);
      setNuevaCategoria({ nombre: "", grupo: "" });
      setErrorCategoria("");
      return;
    }

    categoriaAnterior.current = formData.category;
    setCreandoCategoria(false);
  }, [formData.category]);

  // Categorías desde la API pública. Si el endpoint aún no existe o falla la
  // red, se conservan los valores por defecto sin mostrar ningún error.
  useEffect(() => {
    let activo = true;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/categories`);
        if (!res.ok) return;

        const json = await res.json();
        if (activo && Array.isArray(json?.data)) {
          setCategorias(json.data as CategoriaVista[]);
        }
      } catch {
        // Silencio: la lista por defecto ya está disponible.
      }
    })();

    return () => {
      activo = false;
    };
  }, []);

  // Opciones del select ordenadas por order/nombre. Si el producto que se edita
  // trae una categoría heredada fuera de la lista, se añade al final para no
  // perderla al guardar.
  const opcionesCategoria = useMemo(() => {
    const lista = [...categorias];
    const heredada = product?.category?.trim();

    if (
      heredada &&
      !lista.some((c) => normalizarCategoria(c.name) === normalizarCategoria(heredada))
    ) {
      lista.push({ name: heredada, group: "", order: Number.MAX_SAFE_INTEGER });
    }

    return lista.sort(compararCategorias);
  }, [categorias, product?.category]);

  const gruposDisponibles = useMemo(
    () =>
      [...new Set(categorias.map((c) => c.group).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "es")
      ),
    [categorias]
  );

  const crearCategoria = async () => {
    const nombre = nuevaCategoria.nombre.trim();
    const grupo = nuevaCategoria.grupo.trim();

    if (!nombre) {
      setErrorCategoria("Escribe un nombre para la categoría.");
      return;
    }

    setCreandoCategoriaAhora(true);
    setErrorCategoria("");

    try {
      const creada = await adminFetch<Category>("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: nombre, group: grupo || nombre }),
      });

      setCategorias((prev) => [...prev, creada]);
      setFormData((prev) => ({ ...prev, category: creada.name }));
      setNuevaCategoria({ nombre: "", grupo: "" });
      setCreandoCategoria(false);
    } catch (err) {
      setErrorCategoria(mensajeError(err, "Error al crear la categoría"));
    } finally {
      setCreandoCategoriaAhora(false);
    }
  };

  const cancelarCategoria = () => {
    setFormData((prev) => ({ ...prev, category: categoriaAnterior.current }));
    setNuevaCategoria({ nombre: "", grupo: "" });
    setErrorCategoria("");
    setCreandoCategoria(false);
  };

  // Enter dentro del panel crea la categoría en vez de enviar el formulario
  // principal del producto.
  const manejarEnterCategoria = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!creandoCategoriaAhora) void crearCategoria();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDimensionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setDimensiones((prev) => ({ ...prev, [name]: value }));
  };

  const handleMedidaBaseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setMedidasBase((prev) => ({ ...prev, [name]: value }));
  };

  const addSize = () => {
    if (newSize && !sizes.includes(newSize)) {
      setSizes([...sizes, newSize]);
      setNewSize("");
    }
  };

  const removeSize = (size: string) => {
    setSizes(sizes.filter((s) => s !== size));
  };

  const addColor = () => {
    if (newColorName && !colors.find((c) => c.name === newColorName)) {
      setColors([...colors, { name: newColorName, hex: newColorHex }]);
      setNewColorName("");
      setNewColorHex("#000000");
    }
  };

  const removeColor = (name: string) => {
    setColors(colors.filter((c) => c.name !== name));
  };

  const addVariant = () => {
    if (newVariant.size && newVariant.color) {
      const exists = variants.find((v) => v.size === newVariant.size && v.color === newVariant.color);
      if (!exists) {
        setVariants([...variants, { ...newVariant }]);
        setNewVariant({ size: "", color: "", colorHex: "", stock: 0, price: 0 });
      }
    }
  };

  const removeVariant = (index: number) => {
    setVariants(variants.filter((_, i) => i !== index));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setImages([...images, ...Array.from(e.target.files)]);
    }
  };

  const removeNewImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  // ─── Modelo 3D ──────────────────────────────────────────────────────
  const handleModelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".glb")) {
      setError("El modelo 3D debe estar en formato .glb (GLTF binario).");
      e.target.value = "";
      return;
    }

    const limite = MODELO_MAX_MB * 1024 * 1024;
    if (file.size > limite) {
      setError(
        `El modelo no puede superar los ${MODELO_MAX_MB}MB (actual: ${(file.size / 1048576).toFixed(1)}MB).`
      );
      e.target.value = "";
      return;
    }

    setError("");
    setModelFile(file);
  };

  const nombreArchivo = (url: string) => {
    try {
      return decodeURIComponent(url.split("/").pop() || "modelo.glb");
    } catch {
      return "modelo.glb";
    }
  };

  const removeExistingModel = async () => {
    const token = localStorage.getItem("token");
    if (!token || !productId) return;

    if (!window.confirm("¿Eliminar el modelo 3D de este producto?")) return;

    try {
      const res = await fetch(`${API_URL}/api/products/${productId}/model`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "Error al eliminar el modelo 3D");
        return;
      }

      setExistingModel(null);
    } catch (err) {
      console.error("Error deleting model:", err);
      alert("Error al conectar con el servidor");
    }
  };

  const removeExistingImage = async (imageUrl: string) => {
    const token = localStorage.getItem("token");
    if (!token) return;

    if (!window.confirm("¿Estás seguro de eliminar esta imagen?")) return;

    try {
      const url = `${API_URL}/api/products/${productId}/image?imageUrl=${encodeURIComponent(imageUrl)}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.message || "Error al eliminar la imagen");
        return;
      }

      setExistingImages(existingImages.filter((img) => img !== imageUrl));
    } catch (err) {
      console.error("Error deleting image:", err);
      alert("Error al conectar con el servidor");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // El centinela de "crear nueva" nunca debe viajar como categoría real.
    if (formData.category === "__nueva__") {
      setError("Elige una categoría de la lista o termina de crearla antes de guardar.");
      return;
    }

    // El precio es obligatorio y debe ser mayor que 0.
    const precioTexto = formData.price.trim();
    const precio = Number(precioTexto);
    if (precioTexto === "" || !Number.isFinite(precio) || precio <= 0) {
      setError("El precio debe ser mayor que 0.");
      return;
    }

    // El stock vacío cuenta como 0; si viene, debe ser un entero ≥ 0.
    const stockTexto = formData.stock.trim();
    const stock = stockTexto === "" ? 0 : Number(stockTexto);
    if (!Number.isInteger(stock) || stock < 0) {
      setError("El stock debe ser un número entero mayor o igual a 0.");
      return;
    }

    const descuento = descuentoAplicable(Number(discountPercent) || 0);

    // Al menos una casilla de dimensiones; si las tres quedan vacías al editar
    // se conserva el string original (p. ej. "4, 6 u 8 asientos").
    const medidasEscritas = (["ancho", "largo", "alto"] as const)
      .map((eje) => dimensiones[eje].trim())
      .filter((valor) => valor !== "");

    if (medidasEscritas.length === 0 && !productId) {
      setError("Completa al menos una medida.");
      return;
    }

    const dimensions =
      medidasEscritas.length > 0
        ? medidasEscritas.map((valor) => `${valor}cm`).join(" x ")
        : (product?.dimensions ?? "").trim();

    setLoading(true);
    setError("");

    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/login";
      return;
    }

    let savedId = productId;

    try {
      // Las medidas base sólo viajan si al menos un eje tiene valor > 0.
      const medidasPayload: MedidasBase = {};
      (["ancho", "largo", "alto"] as const).forEach((eje) => {
        const valor = Number(medidasBase[eje]);
        if (Number.isFinite(valor) && valor > 0) medidasPayload[eje] = valor;
      });

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        dimensions,
        price: precio,
        stock,
        category: formData.category.trim(),
        sizes,
        colors,
        variants,
        discountPercent: descuento,
        ...(Object.keys(medidasPayload).length > 0 ? { medidasBase: medidasPayload } : {}),
      };

      const url = productId
        ? `${API_URL}/api/products/${productId}`
        : `${API_URL}/api/products`;

      const res = await fetch(url, {
        method: productId ? "PUT" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.errors?.[0]?.message || data.message || "Error al guardar producto");
      }

      savedId = productId || data.data?._id;
      if (!savedId) {
        throw new Error("No se pudo obtener el ID del producto");
      }

      for (let i = 0; i < images.length; i++) {
        setUploadStatus(`Subiendo imagen ${i + 1} de ${images.length}...`);
        const file = images[i];
        const imageData = new FormData();
        imageData.append("image", file);

        const imageRes = await fetch(`${API_URL}/api/products/${savedId}/images`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: imageData,
        });

        const imageJson = await imageRes.json();

        if (!imageRes.ok) {
          throw new Error(imageJson.message || `Error al subir la imagen ${i + 1}`);
        }

        setImages((prev) => prev.filter((img) => img !== file));
      }

      // El modelo 3D se sube al final, cuando el producto ya existe.
      if (modelFile) {
        setUploadStatus("Subiendo modelo 3D...");
        const modelData = new FormData();
        modelData.append("model", modelFile);

        const modelRes = await fetch(`${API_URL}/api/products/${savedId}/model`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: modelData,
        });

        const modelJson = await modelRes.json();

        if (!modelRes.ok) {
          throw new Error(modelJson.message || "Error al subir el modelo 3D");
        }

        setModelFile(null);
      }

      // Limpieza explícita de medidas base: el PUT omite `medidasBase` cuando
      // los tres campos quedan vacíos, así que si el producto ya tenía medidas
      // hay que borrarlas con un PATCH para que no persistan las anteriores.
      const teniaMedidasBase =
        Boolean(productId) && Object.keys(product?.medidasBase ?? {}).length > 0;

      if (teniaMedidasBase && Object.keys(medidasPayload).length === 0) {
        try {
          const medidasRes = await fetch(`${API_URL}/api/products/${savedId}/medidas`, {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ medidasBase: {} }),
          });

          if (!medidasRes.ok) {
            setError(
              "El producto se guardó, pero no se pudieron limpiar las medidas base anteriores. Revísalas en «Modelos 3D»."
            );
            return;
          }
        } catch {
          setError(
            "El producto se guardó, pero no se pudieron limpiar las medidas base anteriores (error de conexión)."
          );
          return;
        }
      }

      window.location.href = "/admin";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al guardar producto";
      if (!productId && savedId) {
        alert(`${message}. El producto fue creado, se abrirá el formulario para reintentar la subida.`);
        window.location.href = `/admin/products/${savedId}`;
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
      setUploadStatus("");
    }
  };

  // Vista previa del descuento con lo que hay escrito (aún sin validar).
  const precioVista = Number(formData.price) || 0;
  const descuentoVista = descuentoAplicable(Number(discountPercent) || 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleInputChange}
            required
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
          />
        </div>

        <fieldset className="md:col-span-2">
          <legend className="block text-sm font-medium text-gray-700 mb-1">
            Dimensiones (cm)
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {CAMPOS_DIMENSION.map(({ campo, etiqueta }) => (
              <div key={campo}>
                <label
                  htmlFor={`dimension-${campo}`}
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  {etiqueta}
                </label>
                <input
                  id={`dimension-${campo}`}
                  type="number"
                  name={campo}
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  placeholder="cm"
                  value={dimensiones[campo]}
                  onChange={handleDimensionChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                />
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Ancho × largo × alto. Completa al menos una casilla.
          </p>
        </fieldset>

        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
            Categoría
          </label>
          <select
            id="category"
            name="category"
            required
            value={formData.category}
            onChange={handleInputChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
          >
            <option value="" disabled>
              Selecciona una categoría
            </option>
            {opcionesCategoria.map((categoria) => (
              <option
                key={categoria._id ?? normalizarCategoria(categoria.name)}
                value={categoria.name}
              >
                {categoria.name}
              </option>
            ))}
            <option value="__nueva__">+ Crear nueva categoría…</option>
          </select>

          {creandoCategoria && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-900">Nueva categoría</p>
              <p className="mt-1 text-xs text-gray-500">
                Se creará en el catálogo y quedará seleccionada en este producto.
              </p>

              <div className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="nueva-categoria-nombre"
                    className="block text-xs font-medium text-gray-700 mb-1"
                  >
                    Nombre
                  </label>
                  <input
                    id="nueva-categoria-nombre"
                    type="text"
                    required
                    value={nuevaCategoria.nombre}
                    onChange={(e) =>
                      setNuevaCategoria((prev) => ({ ...prev, nombre: e.target.value }))
                    }
                    onKeyDown={manejarEnterCategoria}
                    placeholder="Ej: Bibliotecas"
                    aria-invalid={Boolean(errorCategoria)}
                    aria-describedby={errorCategoria ? "nueva-categoria-error" : undefined}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                </div>

                <div>
                  <label
                    htmlFor="nueva-categoria-grupo"
                    className="block text-xs font-medium text-gray-700 mb-1"
                  >
                    Grupo (opcional)
                  </label>
                  <input
                    id="nueva-categoria-grupo"
                    type="text"
                    list="nueva-categoria-grupos"
                    value={nuevaCategoria.grupo}
                    onChange={(e) =>
                      setNuevaCategoria((prev) => ({ ...prev, grupo: e.target.value }))
                    }
                    onKeyDown={manejarEnterCategoria}
                    placeholder="Ej: Mesas"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                  />
                  <datalist id="nueva-categoria-grupos">
                    {gruposDisponibles.map((grupo) => (
                      <option key={grupo} value={grupo} />
                    ))}
                  </datalist>
                </div>

                {errorCategoria && (
                  <p id="nueva-categoria-error" role="alert" className="text-xs text-red-600">
                    {errorCategoria}
                  </p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void crearCategoria()}
                    disabled={creandoCategoriaAhora}
                    className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:bg-gray-400 transition-colors"
                  >
                    {creandoCategoriaAhora ? "Creando…" : "Crear"}
                  </button>
                  <button
                    type="button"
                    onClick={cancelarCategoria}
                    disabled={creandoCategoriaAhora}
                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 disabled:opacity-50 transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Precio Base (COP)
          </label>
          <input
            type="number"
            name="price"
            value={formData.price}
            onChange={handleInputChange}
            onInvalid={(e) => {
              // Sin `required`: el vacío llega a nuestro submit. Si el navegador
              // bloquea por estar por debajo del mínimo, mostramos el mensaje
              // en español en lugar del tooltip nativo.
              const input = e.currentTarget;
              if (input.validity.valueMissing || input.validity.rangeUnderflow) {
                e.preventDefault();
                setError("El precio debe ser mayor que 0.");
              }
            }}
            min="0.01"
            step="0.01"
            inputMode="decimal"
            placeholder="Ej: 899990"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
          />
        </div>

        <div>
          <label htmlFor="discountPercent" className="block text-sm font-medium text-gray-700 mb-1">
            Descuento (%)
          </label>
          <input
            id="discountPercent"
            type="number"
            min="0"
            max="100"
            step="1"
            inputMode="numeric"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            placeholder="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">
            {descuentoVista > 0 ? (
              <>
                Precio final:{" "}
                <span className="font-medium text-gray-900">
                  {formatPrice(precioConDescuento(precioVista, descuentoVista))}
                </span>{" "}
                <span className="line-through">{formatPrice(precioVista)}</span>
              </>
            ) : (
              "0 % = sin descuento"
            )}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Stock General</label>
          <input
            type="number"
            name="stock"
            value={formData.stock}
            onChange={handleInputChange}
            onInvalid={(e) => {
              const input = e.currentTarget;
              if (input.validity.rangeUnderflow || input.validity.stepMismatch) {
                e.preventDefault();
                setError("El stock debe ser un número entero mayor o igual a 0.");
              }
            }}
            min="0"
            step="1"
            inputMode="numeric"
            placeholder="0"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
          />
        </div>

        {/* Medidas base del modelo 3D */}
        <div className="md:col-span-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h4 className="text-sm font-medium text-gray-900">Medidas base del modelo 3D (cm)</h4>
          <p className="mt-1 text-xs text-gray-500">
            Medidas reales del modelo 3D; permiten escalarlo a las medidas que pida el cliente.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(
              [
                { campo: "ancho", etiqueta: "Ancho (cm)" },
                { campo: "largo", etiqueta: "Largo (cm)" },
                { campo: "alto", etiqueta: "Alto (cm)" },
              ] as const
            ).map(({ campo, etiqueta }) => (
              <div key={campo}>
                <label
                  htmlFor={`medida-base-${campo}`}
                  className="block text-xs font-medium text-gray-700 mb-1"
                >
                  {etiqueta}
                </label>
                <input
                  id={`medida-base-${campo}`}
                  type="number"
                  name={campo}
                  min="0"
                  step="0.1"
                  inputMode="decimal"
                  placeholder="cm"
                  value={medidasBase[campo]}
                  onChange={handleMedidaBaseChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sizes */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900">Medidas disponibles (variantes)</h3>
        <p className="mt-1 mb-4 text-xs text-gray-500">
          Tamaños en los que se fabrica el producto; se muestran en la ficha y alimentan el filtro
          de medidas del catálogo.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newSize}
            onChange={(e) => setNewSize(e.target.value)}
            placeholder="Ej: 240cm x 90cm"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
          />
          <button
            type="button"
            onClick={addSize}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
          >
            Agregar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {sizes.map((size) => (
            <span key={size} className="inline-flex items-center gap-1 bg-gray-100 px-3 py-1 rounded-full text-sm">
              {size}
              <button type="button" onClick={() => removeSize(size)} className="text-gray-500 hover:text-red-500">×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Colors */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Colores</h3>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newColorName}
            onChange={(e) => setNewColorName(e.target.value)}
            placeholder="Nombre del color"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none"
          />
          <input
            type="color"
            value={newColorHex}
            onChange={(e) => setNewColorHex(e.target.value)}
            className="w-12 h-10 rounded cursor-pointer"
          />
          <button
            type="button"
            onClick={addColor}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
          >
            Agregar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {colors.map((color) => (
            <span key={color.name} className="inline-flex items-center gap-2 bg-gray-100 px-3 py-1 rounded-full text-sm">
              <span className="w-4 h-4 rounded-full border" style={{ backgroundColor: color.hex }}></span>
              {color.name}
              <button type="button" onClick={() => removeColor(color.name)} className="text-gray-500 hover:text-red-500">×</button>
            </span>
          ))}
        </div>
      </div>

      {/* Variants */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Variantes (Medida + Color + Stock)</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
          <select
            value={newVariant.size}
            onChange={(e) => setNewVariant({ ...newVariant, size: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Medida</option>
            {sizes.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={newVariant.color}
            onChange={(e) => {
              const color = colors.find((c) => c.name === e.target.value);
              setNewVariant({ ...newVariant, color: e.target.value, colorHex: color?.hex || "" });
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">Color</option>
            {colors.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
          <input
            type="number"
            value={newVariant.stock || ""}
            onChange={(e) => setNewVariant({ ...newVariant, stock: Number(e.target.value) })}
            placeholder="Stock"
            min="0"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            type="number"
            value={newVariant.price || ""}
            onChange={(e) => setNewVariant({ ...newVariant, price: Number(e.target.value) })}
            placeholder="Precio (opcional)"
            min="0"
            step="1"
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={addVariant}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 text-sm"
          >
            Agregar
          </button>
        </div>
        {variants.length > 0 && (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Medida</th>
                <th className="text-left py-2">Color</th>
                <th className="text-left py-2">Stock</th>
                <th className="text-left py-2">Precio</th>
                <th className="text-right py-2">Acción</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v, i) => (
                <tr key={i} className="border-b">
                  <td className="py-2">{v.size}</td>
                  <td className="py-2">
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: v.colorHex }}></span>
                      {v.color}
                    </span>
                  </td>
                  <td className="py-2">{v.stock}</td>
                  <td className="py-2">{v.price > 0 ? formatPrice(v.price) : "-"}</td>
                  <td className="py-2 text-right">
                    <button type="button" onClick={() => removeVariant(i)} className="text-red-500 hover:text-red-700">Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Images */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Imágenes</h3>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleImageChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />
        <p className="text-xs text-gray-500 mt-1">JPEG, PNG o WebP. Máximo 4MB por imagen.</p>

        {existingImages.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Imágenes actuales:</p>
            <div className="flex flex-wrap gap-3">
              {existingImages.map((img) => (
                <div key={img} className="relative">
                  <img src={proxyImageUrl(img)} alt="" className="w-24 h-24 object-cover rounded border" />
                  <button
                    type="button"
                    onClick={() => removeExistingImage(img)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-xs hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {images.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Nuevas imágenes:</p>
            <div className="flex flex-wrap gap-3">
              {images.map((img, i) => (
                <div key={i} className="relative">
                  <img src={URL.createObjectURL(img)} alt="" className="w-24 h-24 object-cover rounded border" />
                  <button
                    type="button"
                    onClick={() => removeNewImage(i)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white w-5 h-5 rounded-full text-xs hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modelo 3D */}
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-gray-900 mb-1">Modelo 3D</h3>
        <p className="text-xs text-gray-500 mb-4">
          Formato GLB, máximo {MODELO_MAX_MB}MB. Se muestra en la sección «Vista 3D» de la página del
          producto y se escala según las <span className="font-medium">Dimensiones</span> del producto
          (ancho × largo × alto).
        </p>

        <input
          type="file"
          accept=".glb,model/gltf-binary"
          onChange={handleModelChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg"
        />

        {modelFile && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-jk-gold bg-jk-cream px-4 py-3">
            <span className="text-sm text-jk-gold-deep">
              Nuevo modelo: <span className="font-medium">{modelFile.name}</span> (
              {(modelFile.size / 1048576).toFixed(1)}MB)
            </span>
            <button
              type="button"
              onClick={() => setModelFile(null)}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Quitar
            </button>
          </div>
        )}

        {existingModel && !modelFile && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <span className="text-sm text-gray-700">
              Modelo actual: <span className="font-medium">{nombreArchivo(existingModel)}</span>
            </span>
            <a
              href={existingModel}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-900 underline hover:text-gray-700"
            >
              Ver archivo
            </a>
            <button
              type="button"
              onClick={removeExistingModel}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Eliminar
            </button>
          </div>
        )}
      </div>

      <div className="border-t pt-6 flex gap-4">
        <button
          type="submit"
          disabled={loading}
          className="bg-gray-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:bg-gray-400"
        >
          {loading ? uploadStatus || "Guardando..." : productId ? "Guardar Cambios" : "Crear Producto"}
        </button>
        <a
          href="/admin"
          className="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  );
}
