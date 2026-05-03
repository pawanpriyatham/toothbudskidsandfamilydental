"use strict";

(function () {
  var form = document.getElementById("appointmentForm");
  var messageBox = document.getElementById("formMessage");
  var submitBtn = document.getElementById("submitBtn");
  var dateInput = document.getElementById("visitDate");

  if (!form || !messageBox || !submitBtn || !dateInput) {
    return;
  }

  var today = new Date();
  var yyyy = today.getFullYear();
  var mm = String(today.getMonth() + 1).padStart(2, "0");
  var dd = String(today.getDate()).padStart(2, "0");
  dateInput.min = yyyy + "-" + mm + "-" + dd;

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    clearMessage();

    var payload = collectFormData();
    var validationError = validate(payload);
    if (validationError) {
      showMessage(validationError, "error");
      return;
    }

    setLoading(true);
    try {
      var endpointUrl =
        (window.APP_CONFIG && window.APP_CONFIG.APPS_SCRIPT_WEB_APP_URL) || "";
      if (!endpointUrl) {
        throw new Error(
          "Booking endpoint is not configured. Update js/config.js with your Google Apps Script URL.",
        );
      }

      var requestBody = new URLSearchParams();
      Object.keys(payload).forEach(function (key) {
        requestBody.append(key, payload[key]);
      });

      await fetch(endpointUrl, {
        method: "POST",
        mode: "no-cors",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: requestBody.toString(),
      });

      form.reset();
      showMessage(
        "Appointment request submitted successfully. Please check your email for confirmation. If you do not receive it shortly, please call the clinic.",
        "success",
      );
    } catch (error) {
      showMessage(
        error.message || "Something went wrong. Please try again.",
        "error",
      );
    } finally {
      setLoading(false);
    }
  });

  function collectFormData() {
    var formData = new FormData(form);
    return {
      firstName: String(formData.get("firstName") || "").trim(),
      lastName: String(formData.get("lastName") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      mobile: String(formData.get("mobile") || "").trim(),
      age: String(formData.get("age") || "").trim(),
      gender: String(formData.get("gender") || "").trim(),
      serviceType: String(formData.get("serviceType") || "").trim(),
      problemDescription: String(
        formData.get("problemDescription") || "",
      ).trim(),
      visitDate: String(formData.get("visitDate") || "").trim(),
      timeSlot: String(formData.get("timeSlot") || "").trim(),
      consent: formData.get("consent") === "on",
      website: String(formData.get("website") || "").trim(),
    };
  }

  function validate(data) {
    var required = [
      "firstName",
      "lastName",
      "email",
      "mobile",
      "age",
      "gender",
      "serviceType",
      "problemDescription",
      "visitDate",
      "timeSlot",
    ];

    for (var i = 0; i < required.length; i += 1) {
      if (!data[required[i]]) {
        return "Please fill all mandatory fields.";
      }
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      return "Please enter a valid email address.";
    }

    if (!/^[0-9+\-\s]{10,15}$/.test(data.mobile)) {
      return "Please enter a valid mobile number.";
    }

    var ageNum = Number(data.age);
    if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120) {
      return "Please enter a valid age between 1 and 120.";
    }

    if (!data.consent) {
      return "Please provide consent to continue.";
    }

    return "";
  }

  function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.classList.remove(
      "hidden",
      "bg-red-50",
      "text-red-700",
      "bg-green-50",
      "text-green-700",
    );
    if (type === "success") {
      messageBox.classList.add("bg-green-50", "text-green-700");
    } else {
      messageBox.classList.add("bg-red-50", "text-red-700");
    }
  }

  function clearMessage() {
    messageBox.classList.add("hidden");
    messageBox.textContent = "";
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? "Submitting..." : "Book Appointment";
  }
})();
