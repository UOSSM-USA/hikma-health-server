/**
 * Translation files for the application
 * Supports English (en) and Arabic (ar)
 */

export type TranslationKey = keyof typeof translations.en;

export const translations = {
  en: {
    // Navigation
    nav: {
      dashboard: "Dashboard",
      patients: "Patients",
      patientsList: "Patients List",
      registerNewPatient: "Register New Patient",
      registrationForm: "Registration Form",
      eventForms: "Event Forms",
      formsList: "Forms List",
      registerNewForm: "Register New Form",
      users: "Users",
      usersList: "Users List",
      newUser: "New User",
      clinics: "Clinics",
      clinicsList: "Clinics List",
      newClinic: "New Clinic",
      appointments: "Appointments",
      appointmentsList: "Appointments List",
      newAppointment: "New Appointment",
      prescriptions: "Prescriptions",
      prescriptionsList: "Prescriptions List",
      newPrescription: "New Prescription",
      dataAnalysis: "Data Analysis",
      reports: "Reports (?)",
      exploreEvents: "Explore Events",
      settings: "Settings",
      mobileApps: "Mobile Apps",
      fileStorage: "File Storage",
      signOut: "Sign out",
    },
    // Common UI
    common: {
      save: "Save",
      cancel: "Cancel",
      delete: "Delete",
      edit: "Edit",
      create: "Create",
      search: "Search",
      filter: "Filter",
      loading: "Loading...",
      error: "Error",
      success: "Success",
      confirm: "Confirm",
      close: "Close",
      back: "Back",
      next: "Next",
      previous: "Previous",
      submit: "Submit",
      reset: "Reset",
      required: "Required",
      optional: "Optional",
      yes: "Yes",
      no: "No",
    },
    // Messages
    messages: {
      signOutConfirm: "Are you sure you want to sign out?",
      noPermission: "You do not have permission to access this resource.",
      formSaved: "Form saved successfully",
      formDeleted: "Form deleted successfully",
      patientCreated: "Patient created successfully",
      userCreated: "User created successfully",
      clinicCreated: "Clinic created successfully",
      languageSaved: "Language preference saved as default",
      languageSaveError: "Failed to save language preference",
      formSaveError: "Failed to save form",
      formDeleteError: "Failed to delete form",
      formIncompleteConfirm: "Some fields of the form are incomplete or empty. Are you sure you want to continue?",
    },
    // Language
    language: {
      english: "English",
      arabic: "Arabic",
      selectLanguage: "Select Language",
      saveAsDefault: "Save as default",
    },
    // Form Fields
    forms: {
      name: "Name",
      email: "Email",
      password: "Password",
      confirmPassword: "Confirm Password",
      role: "Role",
      clinic: "Clinic",
      phone: "Phone",
      address: "Address",
      dateOfBirth: "Date of Birth",
      gender: "Gender",
      status: "Status",
      description: "Description",
      title: "Title",
      type: "Type",
      required: "Required",
      optional: "Optional",
      placeholder: "Placeholder",
      addField: "Add Field",
      removeField: "Remove Field",
      fieldLabel: "Field Label",
      fieldType: "Field Type",
      fieldOptions: "Field Options",
      validation: "Validation",
      minLength: "Minimum Length",
      maxLength: "Maximum Length",
      minValue: "Minimum Value",
      maxValue: "Maximum Value",
      pattern: "Pattern",
      submit: "Submit",
      cancel: "Cancel",
      save: "Save",
      delete: "Delete",
      edit: "Edit",
      create: "Create",
      update: "Update",
      loading: "Loading...",
      selectOption: "Select an option",
      enterText: "Enter text...",
      enterNumber: "Enter number...",
      selectDate: "Select date",
      noOptions: "No options available",
    },
    // Tables
    table: {
      actions: "Actions",
      noData: "No data available",
      showing: "Showing",
      of: "of",
      results: "results",
      page: "Page",
      rowsPerPage: "Rows per page",
      search: "Search",
      filter: "Filter",
      sort: "Sort",
      ascending: "Ascending",
      descending: "Descending",
      selectAll: "Select All",
      deselectAll: "Deselect All",
      selected: "selected",
      snapshot: "Snapshot",
      editable: "Editable",
      name: "Name",
      description: "Description",
      created: "Created",
      updated: "Updated",
      noFormsAvailable: "No forms available",
    },
    // Validation Messages
    validation: {
      required: "This field is required",
      email: "Please enter a valid email address",
      minLength: "Minimum length is {min} characters",
      maxLength: "Maximum length is {max} characters",
      min: "Minimum value is {min}",
      max: "Maximum value is {max}",
      pattern: "Please match the required pattern",
      passwordMismatch: "Passwords do not match",
      invalidDate: "Please enter a valid date",
      invalidNumber: "Please enter a valid number",
      selectFieldOptionsRequired: "Please make sure all select fields have at least one option",
    },
    // Status Messages
    status: {
      active: "Active",
      inactive: "Inactive",
      pending: "Pending",
      completed: "Completed",
      cancelled: "Cancelled",
      draft: "Draft",
      published: "Published",
      archived: "Archived",
    },
    // Patient Fields
    patient: {
      firstName: "First Name",
      lastName: "Last Name",
      fullName: "Full Name",
      patientId: "Patient ID",
      registrationDate: "Registration Date",
      age: "Age",
      sex: "Sex",
      male: "Male",
      female: "Female",
      other: "Other",
      medicalHistory: "Medical History",
      allergies: "Allergies",
      medications: "Medications",
      notes: "Notes",
    },
    // User Fields
    user: {
      userName: "User Name",
      userEmail: "Email",
      userRole: "Role",
      userClinic: "Clinic",
      lastLogin: "Last Login",
      createdAt: "Created At",
      actions: "Actions",
    },
    // Clinic Fields
    clinic: {
      clinicName: "Clinic Name",
      clinicAddress: "Address",
      clinicPhone: "Phone",
      clinicEmail: "Email",
      department: "Department",
      departments: "Departments",
    },
    // Event Form Fields
    eventForm: {
      formName: "Form Name",
      formDescription: "Description",
      formLanguage: "Language",
      isEditable: "Editable",
      isSnapshotForm: "Snapshot Form",
      formFields: "Form Fields",
      addField: "Add Field",
      fieldName: "Field Name",
      fieldLabel: "Field Label",
      fieldType: "Field Type",
      fieldRequired: "Required",
    },
    // Prescription Fields
    prescription: {
      medication: "Medication",
      dosage: "Dosage",
      frequency: "Frequency",
      duration: "Duration",
      instructions: "Instructions",
      prescribedBy: "Prescribed By",
      prescribedDate: "Prescribed Date",
      status: "Status",
    },
    // Appointment Fields
    appointment: {
      appointmentDate: "Appointment Date",
      appointmentTime: "Time",
      provider: "Provider",
      department: "Department",
      reason: "Reason",
      notes: "Notes",
      status: "Status",
    },
  },
  ar: {
    // Navigation
    nav: {
      dashboard: "لوحة التحكم",
      patients: "المرضى",
      patientsList: "قائمة المرضى",
      registerNewPatient: "تسجيل مريض جديد",
      registrationForm: "نموذج التسجيل",
      eventForms: "نماذج الأحداث",
      formsList: "قائمة النماذج",
      registerNewForm: "تسجيل نموذج جديد",
      users: "المستخدمون",
      usersList: "قائمة المستخدمين",
      newUser: "مستخدم جديد",
      clinics: "العيادات",
      clinicsList: "قائمة العيادات",
      newClinic: "عيادة جديدة",
      appointments: "المواعيد",
      appointmentsList: "قائمة المواعيد",
      newAppointment: "موعد جديد",
      prescriptions: "الوصفات الطبية",
      prescriptionsList: "قائمة الوصفات الطبية",
      newPrescription: "وصفة طبية جديدة",
      dataAnalysis: "تحليل البيانات",
      reports: "التقارير (؟)",
      exploreEvents: "استكشاف الأحداث",
      settings: "الإعدادات",
      mobileApps: "التطبيقات المحمولة",
      fileStorage: "تخزين الملفات",
      signOut: "تسجيل الخروج",
    },
    // Common UI
    common: {
      save: "حفظ",
      cancel: "إلغاء",
      delete: "حذف",
      edit: "تعديل",
      create: "إنشاء",
      search: "بحث",
      filter: "تصفية",
      loading: "جاري التحميل...",
      error: "خطأ",
      success: "نجح",
      confirm: "تأكيد",
      close: "إغلاق",
      back: "رجوع",
      next: "التالي",
      previous: "السابق",
      submit: "إرسال",
      reset: "إعادة تعيين",
      required: "مطلوب",
      optional: "اختياري",
      yes: "نعم",
      no: "لا",
    },
    // Messages
    messages: {
      signOutConfirm: "هل أنت متأكد أنك تريد تسجيل الخروج؟",
      noPermission: "ليس لديك إذن للوصول إلى هذا المورد.",
      formSaved: "تم حفظ النموذج بنجاح",
      formDeleted: "تم حذف النموذج بنجاح",
      patientCreated: "تم إنشاء المريض بنجاح",
      userCreated: "تم إنشاء المستخدم بنجاح",
      clinicCreated: "تم إنشاء العيادة بنجاح",
      languageSaved: "تم حفظ تفضيل اللغة كافتراضي",
      languageSaveError: "فشل حفظ تفضيل اللغة",
      formSaveError: "فشل حفظ النموذج",
      formDeleteError: "فشل حذف النموذج",
      formIncompleteConfirm: "بعض حقول النموذج غير مكتملة أو فارغة. هل أنت متأكد أنك تريد المتابعة؟",
    },
    // Language
    language: {
      english: "الإنجليزية",
      arabic: "العربية",
      selectLanguage: "اختر اللغة",
      saveAsDefault: "حفظ كافتراضي",
    },
    // Form Fields
    forms: {
      name: "الاسم",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      confirmPassword: "تأكيد كلمة المرور",
      role: "الدور",
      clinic: "العيادة",
      phone: "الهاتف",
      address: "العنوان",
      dateOfBirth: "تاريخ الميلاد",
      gender: "الجنس",
      status: "الحالة",
      description: "الوصف",
      title: "العنوان",
      type: "النوع",
      required: "مطلوب",
      optional: "اختياري",
      placeholder: "النص التوضيحي",
      addField: "إضافة حقل",
      removeField: "إزالة حقل",
      fieldLabel: "تسمية الحقل",
      fieldType: "نوع الحقل",
      fieldOptions: "خيارات الحقل",
      validation: "التحقق",
      minLength: "الحد الأدنى للطول",
      maxLength: "الحد الأقصى للطول",
      minValue: "الحد الأدنى للقيمة",
      maxValue: "الحد الأقصى للقيمة",
      pattern: "النمط",
      submit: "إرسال",
      cancel: "إلغاء",
      save: "حفظ",
      delete: "حذف",
      edit: "تعديل",
      create: "إنشاء",
      update: "تحديث",
      loading: "جاري التحميل...",
      selectOption: "اختر خياراً",
      enterText: "أدخل النص...",
      enterNumber: "أدخل الرقم...",
      selectDate: "اختر التاريخ",
      noOptions: "لا توجد خيارات متاحة",
    },
    // Tables
    table: {
      actions: "الإجراءات",
      noData: "لا توجد بيانات متاحة",
      showing: "عرض",
      of: "من",
      results: "نتيجة",
      page: "الصفحة",
      rowsPerPage: "صفوف في الصفحة",
      search: "بحث",
      filter: "تصفية",
      sort: "ترتيب",
      ascending: "تصاعدي",
      descending: "تنازلي",
      selectAll: "تحديد الكل",
      deselectAll: "إلغاء تحديد الكل",
      selected: "محدد",
      snapshot: "لقطة",
      editable: "قابل للتعديل",
      name: "الاسم",
      description: "الوصف",
      created: "تم الإنشاء",
      updated: "تم التحديث",
      noFormsAvailable: "لا توجد نماذج متاحة",
    },
    // Validation Messages
    validation: {
      required: "هذا الحقل مطلوب",
      email: "يرجى إدخال عنوان بريد إلكتروني صحيح",
      minLength: "الحد الأدنى للطول هو {min} أحرف",
      maxLength: "الحد الأقصى للطول هو {max} أحرف",
      min: "الحد الأدنى للقيمة هو {min}",
      max: "الحد الأقصى للقيمة هو {max}",
      pattern: "يرجى مطابقة النمط المطلوب",
      passwordMismatch: "كلمات المرور غير متطابقة",
      invalidDate: "يرجى إدخال تاريخ صحيح",
      invalidNumber: "يرجى إدخال رقم صحيح",
      selectFieldOptionsRequired: "يرجى التأكد من أن جميع حقول الاختيار تحتوي على خيار واحد على الأقل",
    },
    // Status Messages
    status: {
      active: "نشط",
      inactive: "غير نشط",
      pending: "قيد الانتظار",
      completed: "مكتمل",
      cancelled: "ملغي",
      draft: "مسودة",
      published: "منشور",
      archived: "مؤرشف",
    },
    // Patient Fields
    patient: {
      firstName: "الاسم الأول",
      lastName: "اسم العائلة",
      fullName: "الاسم الكامل",
      patientId: "رقم المريض",
      registrationDate: "تاريخ التسجيل",
      age: "العمر",
      sex: "الجنس",
      male: "ذكر",
      female: "أنثى",
      other: "آخر",
      medicalHistory: "التاريخ الطبي",
      allergies: "الحساسيات",
      medications: "الأدوية",
      notes: "ملاحظات",
    },
    // User Fields
    user: {
      userName: "اسم المستخدم",
      userEmail: "البريد الإلكتروني",
      userRole: "الدور",
      userClinic: "العيادة",
      lastLogin: "آخر تسجيل دخول",
      createdAt: "تاريخ الإنشاء",
      actions: "الإجراءات",
    },
    // Clinic Fields
    clinic: {
      clinicName: "اسم العيادة",
      clinicAddress: "العنوان",
      clinicPhone: "الهاتف",
      clinicEmail: "البريد الإلكتروني",
      department: "القسم",
      departments: "الأقسام",
    },
    // Event Form Fields
    eventForm: {
      formName: "اسم النموذج",
      formDescription: "الوصف",
      formLanguage: "اللغة",
      isEditable: "قابل للتعديل",
      isSnapshotForm: "نموذج لقطة",
      formFields: "حقول النموذج",
      addField: "إضافة حقل",
      fieldName: "اسم الحقل",
      fieldLabel: "تسمية الحقل",
      fieldType: "نوع الحقل",
      fieldRequired: "مطلوب",
    },
    // Prescription Fields
    prescription: {
      medication: "الدواء",
      dosage: "الجرعة",
      frequency: "التكرار",
      duration: "المدة",
      instructions: "التعليمات",
      prescribedBy: "وصف من قبل",
      prescribedDate: "تاريخ الوصفة",
      status: "الحالة",
    },
    // Appointment Fields
    appointment: {
      appointmentDate: "تاريخ الموعد",
      appointmentTime: "الوقت",
      provider: "مقدم الخدمة",
      department: "القسم",
      reason: "السبب",
      notes: "ملاحظات",
      status: "الحالة",
    },
  },
} as const;

export type Language = keyof typeof translations;

export const supportedLanguages: Language[] = ["en", "ar"];

export function getTranslation(
  key: TranslationKey,
  language: Language = "en"
): string {
  const translation = translations[language]?.[key];
  if (!translation) {
    // Fallback to English if translation not found
    return translations.en[key] || String(key);
  }
  return translation;
}

/**
 * Helper to get nested translation values
 * Usage: t("nav.dashboard") -> "Dashboard" or "لوحة التحكم"
 */
export function t(
  path: string,
  language: Language = "en"
): string {
  const keys = path.split(".");
  let value: any = translations[language];

  for (const key of keys) {
    value = value?.[key];
    if (value === undefined) {
      // Fallback to English
      value = translations.en;
      for (const fallbackKey of keys) {
        value = value?.[fallbackKey];
        if (value === undefined) {
          return path; // Return path if translation not found
        }
      }
      break;
    }
  }

  return typeof value === "string" ? value : path;
}

