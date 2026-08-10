export function calcularEdad(fechaNacimiento: string): number {
  const nacimiento = new Date(fechaNacimiento);
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const noCumplioAnioTodavia =
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate());
  if (noCumplioAnioTodavia) edad--;
  return edad;
}
