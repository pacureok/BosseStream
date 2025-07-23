function checkAccess() {
  const code = document.getElementById("accessCode").value;
  if (code === "1d2g3h5hd4g") {
    document.getElementById("access").style.display = "none";
    document.getElementById("mainApp").style.display = "block";
  } else {
    alert("Código incorrecto");
  }
}
