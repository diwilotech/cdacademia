// Materiales de ejemplo para estudiar y para ligar a los exámenes. Se cargan con el botón «Cargar ejemplos» de Material.
// area: nombre del área a la que se enlazan si existe (si no, quedan sin área).
const t = (texto) => ({ tipo: 'texto', texto });
const h = (texto) => ({ tipo: 'titulo', texto });
const s = (texto) => ({ tipo: 'subtitulo', texto });
const l = (texto) => ({ tipo: 'lista', texto });
// Preguntas del examen de ejemplo de cada material: U = una correcta, M = varias, V = verdadero/falso, C = respuesta corta.
const U = (enunciado, ops, ok) => ({ tipo: 'unica', enunciado, puntos: 1, opciones: ops.map((texto, i) => ({ texto, ok: i === ok })) });
const M = (enunciado, ops, oks) => ({ tipo: 'multiple', enunciado, puntos: 2, opciones: ops.map((texto, i) => ({ texto, ok: oks.includes(i) })) });
const V = (enunciado, vf) => ({ tipo: 'vf', enunciado, puntos: 1, vf });
const C = (enunciado, respuesta) => ({ tipo: 'corta', enunciado, puntos: 1, respuesta });

export const MATERIALES_EJEMPLO = [
  { titulo: 'Teoría del color en maquillaje', area: 'Maquillaje', nivel: 'Básico', descripcion: 'Círculo cromático, subtonos de piel y cómo corregir con color.',
    preguntas: [U('¿Qué colores son complementarios?', ['Los que están frente a frente en el círculo cromático', 'Los que están uno al lado del otro', 'Solo los primarios', 'Los tonos de la misma familia'], 0), U('¿Qué color neutraliza el enrojecimiento?', ['Verde', 'Naranja', 'Lila', 'Amarillo'], 0), M('¿Cuáles son subtonos de la piel?', ['Cálido', 'Frío', 'Neutro', 'Metálico'], [0, 1, 2]), V('El naranja o durazno neutraliza las ojeras azuladas.', true)],
    bloques: [h('Teoría del color'), t('El **círculo cromático** organiza los colores primarios (rojo, amarillo, azul), secundarios y terciarios. Los colores *complementarios* están frente a frente y se neutralizan entre sí.'),
      s('Subtonos de la piel'), l('Cálido: dorado o durazno.\nFrío: rosado o azulado.\nNeutro: mezcla de ambos.'),
      s('Corrección de color'), l('Verde neutraliza el enrojecimiento.\nNaranja o durazno neutraliza ojeras azuladas.\nLila neutraliza el tono amarillo.\nAmarillo neutraliza manchas moradas.')] },
  { titulo: 'Preparación de la piel y base', area: 'Maquillaje', nivel: 'Básico', descripcion: 'Rutina previa, tipos de piel y aplicación de la base.',
    preguntas: [U('¿Dónde se prueba el tono de la base?', ['En la mandíbula', 'En la palma de la mano', 'En la frente', 'En el cuello'], 0), U('Para piel grasa se recomienda…', ['Productos matificantes y primer de poros', 'Cremas muy densas', 'Aceites faciales', 'No hidratar'], 0), V('El protector solar se aplica antes del primer.', true), C('¿Qué paso va primero al preparar la piel?', 'limpiar')],
    bloques: [h('Preparación de la piel'), s('Tipos de piel'), l('Seca: necesita hidratación y bases luminosas.\nMixta: zona T con brillo, mejillas secas.\nGrasa: productos matificantes y primer de poros.\nSensible: evitar fragancias y exfoliar con suavidad.'),
      s('Pasos antes de maquillar'), { tipo: 'numerada', texto: 'Limpiar el rostro.\nTonificar.\nHidratar según el tipo de piel.\nAplicar protector solar.\nPrimer en las zonas que lo necesiten.' },
      t('La base se elige por **subtono** y se prueba en la mandíbula, no en la mano.')] },
  { titulo: 'Visagismo y diseño de cejas', area: 'Cejas y pestañas', nivel: 'Básico', descripcion: 'Mapeo del rostro y proporciones para diseñar la ceja.',
    preguntas: [U('El mapeo de la ceja parte desde…', ['El ala de la nariz', 'La punta de la nariz', 'El centro de la frente', 'La comisura de los labios'], 0), U('En un rostro redondo conviene un arco…', ['Más marcado para alargar', 'Muy redondeado', 'Sin arco', 'Descendente'], 0), V('Para un rostro alargado la ceja debe ser más horizontal.', true), M('¿Qué puntos se trazan en el mapeo?', ['Inicio', 'Arco', 'Fin', 'Pestaña'], [0, 1, 2])],
    bloques: [h('Diseño de cejas'), t('El diseño parte del **mapeo**: tres puntos que se trazan con un lápiz desde el ala de la nariz.'),
      { tipo: 'numerada', texto: 'Inicio: vertical desde el ala de la nariz hacia arriba.\nArco: diagonal desde el ala de la nariz pasando por la pupila.\nFin: diagonal desde el ala de la nariz por la comisura externa del ojo.' },
      s('Según la forma del rostro'), l('Ovalado: ceja suave con arco ligero.\nRedondo: arco más marcado para alargar.\nCuadrado: arco curvo para suavizar.\nAlargado: ceja más recta y horizontal.')] },
  { titulo: 'Higiene y bioseguridad en el servicio', area: null, nivel: 'Básico', descripcion: 'Normas que aplican a cualquier servicio de belleza.',
    preguntas: [M('¿Qué se hace antes de cada servicio?', ['Lavar las manos', 'Desinfectar superficies e implementos', 'Usar guantes y tapabocas', 'Reutilizar desechables'], [0, 1, 2]), V('Las herramientas se desinfectan entre cliente y cliente.', true), V('Se pueden reutilizar los productos desechables.', false), C('¿Qué se registra del cliente antes del servicio: alergias y condiciones de la…?', 'piel')],
    bloques: [h('Bioseguridad'), t('Antes de cada servicio se desinfectan las superficies y los implementos, y se usa material desechable cuando sea posible.'),
      l('Lavado de manos antes y después del servicio.\nUso de guantes y tapabocas.\nDesinfección de herramientas entre clientes.\nNo reutilizar productos desechables.\nRegistrar alergias y condiciones de la piel del cliente.')] },
  { titulo: 'Corte degradado: técnica básica', area: 'Barbería', nivel: 'Básico', descripcion: 'Zonas de la cabeza, guías y secuencia del degradado.',
    preguntas: [U('¿Qué se define primero en un degradado?', ['La línea de guía', 'El perfilado final', 'El peinado', 'El largo de la parte alta'], 0), M('¿Zonas de la cabeza en el degradado?', ['Baja', 'Media', 'Alta', 'Frontal derecha'], [0, 1, 2]), V('Las transiciones se difuminan con la máquina en movimiento.', true), U('La guía más corta se usa en…', ['La zona baja', 'La corona', 'La parte superior', 'El flequillo'], 0)],
    bloques: [h('Degradado'), s('Zonas de la cabeza'), l('Zona baja: nuca y patillas.\nZona media: laterales.\nZona alta: corona y parte superior.'),
      s('Secuencia'), { tipo: 'numerada', texto: 'Definir la línea de guía.\nCortar con la guía más corta en la zona baja.\nSubir con guías más largas hacia la zona media.\nDifuminar las transiciones con la máquina en movimiento.\nPerfilar contornos y revisar la simetría.' }] },
];
