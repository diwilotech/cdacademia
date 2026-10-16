// Materiales de ejemplo para estudiar y para ligar a los exámenes. Se cargan con el botón «Cargar ejemplos» de Material.
// area: nombre del área a la que se enlazan si existe (si no, quedan sin área).
const t = (texto) => ({ tipo: 'texto', texto });
const h = (texto) => ({ tipo: 'titulo', texto });
const s = (texto) => ({ tipo: 'subtitulo', texto });
const l = (texto) => ({ tipo: 'lista', texto });

export const MATERIALES_EJEMPLO = [
  { titulo: 'Teoría del color en maquillaje', area: 'Maquillaje', nivel: 'Básico', descripcion: 'Círculo cromático, subtonos de piel y cómo corregir con color.',
    bloques: [h('Teoría del color'), t('El **círculo cromático** organiza los colores primarios (rojo, amarillo, azul), secundarios y terciarios. Los colores *complementarios* están frente a frente y se neutralizan entre sí.'),
      s('Subtonos de la piel'), l('Cálido: dorado o durazno.\nFrío: rosado o azulado.\nNeutro: mezcla de ambos.'),
      s('Corrección de color'), l('Verde neutraliza el enrojecimiento.\nNaranja o durazno neutraliza ojeras azuladas.\nLila neutraliza el tono amarillo.\nAmarillo neutraliza manchas moradas.')] },
  { titulo: 'Preparación de la piel y base', area: 'Maquillaje', nivel: 'Básico', descripcion: 'Rutina previa, tipos de piel y aplicación de la base.',
    bloques: [h('Preparación de la piel'), s('Tipos de piel'), l('Seca: necesita hidratación y bases luminosas.\nMixta: zona T con brillo, mejillas secas.\nGrasa: productos matificantes y primer de poros.\nSensible: evitar fragancias y exfoliar con suavidad.'),
      s('Pasos antes de maquillar'), { tipo: 'numerada', texto: 'Limpiar el rostro.\nTonificar.\nHidratar según el tipo de piel.\nAplicar protector solar.\nPrimer en las zonas que lo necesiten.' },
      t('La base se elige por **subtono** y se prueba en la mandíbula, no en la mano.')] },
  { titulo: 'Visagismo y diseño de cejas', area: 'Cejas y pestañas', nivel: 'Básico', descripcion: 'Mapeo del rostro y proporciones para diseñar la ceja.',
    bloques: [h('Diseño de cejas'), t('El diseño parte del **mapeo**: tres puntos que se trazan con un lápiz desde el ala de la nariz.'),
      { tipo: 'numerada', texto: 'Inicio: vertical desde el ala de la nariz hacia arriba.\nArco: diagonal desde el ala de la nariz pasando por la pupila.\nFin: diagonal desde el ala de la nariz por la comisura externa del ojo.' },
      s('Según la forma del rostro'), l('Ovalado: ceja suave con arco ligero.\nRedondo: arco más marcado para alargar.\nCuadrado: arco curvo para suavizar.\nAlargado: ceja más recta y horizontal.')] },
  { titulo: 'Higiene y bioseguridad en el servicio', area: null, nivel: 'Básico', descripcion: 'Normas que aplican a cualquier servicio de belleza.',
    bloques: [h('Bioseguridad'), t('Antes de cada servicio se desinfectan las superficies y los implementos, y se usa material desechable cuando sea posible.'),
      l('Lavado de manos antes y después del servicio.\nUso de guantes y tapabocas.\nDesinfección de herramientas entre clientes.\nNo reutilizar productos desechables.\nRegistrar alergias y condiciones de la piel del cliente.')] },
  { titulo: 'Corte degradado: técnica básica', area: 'Barbería', nivel: 'Básico', descripcion: 'Zonas de la cabeza, guías y secuencia del degradado.',
    bloques: [h('Degradado'), s('Zonas de la cabeza'), l('Zona baja: nuca y patillas.\nZona media: laterales.\nZona alta: corona y parte superior.'),
      s('Secuencia'), { tipo: 'numerada', texto: 'Definir la línea de guía.\nCortar con la guía más corta en la zona baja.\nSubir con guías más largas hacia la zona media.\nDifuminar las transiciones con la máquina en movimiento.\nPerfilar contornos y revisar la simetría.' }] },
];
